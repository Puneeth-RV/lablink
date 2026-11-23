import { describe, expect, it } from 'vitest';
import { allocate, conflictGroups, findAlternatives, isSlotFree, scoreRequest } from '../../src/server/domain/allocation.js';
import { checkFeasibility, recentUsageHours, WEEKLY_HOUR_CAP } from '../../src/server/domain/policy.js';
import { campusTime, candidateSlots, DAY_MS, HOUR_MS, isWithinLabHours, overlaps, toInterval } from '../../src/server/domain/time.js';
import { utilisationReport } from '../../src/server/domain/utilisation.js';
import type { AllocationContext } from '../../src/server/domain/allocation.js';
import { booking, equipment, NOW, project, slot, slotRequest, user } from './fixtures.js';

describe('time', () => {
  it('detects overlapping half-open intervals', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  });

  it('accepts slots inside 09:00–18:00 IST only', () => {
    expect(isWithinLabHours(toInterval(slot(0, 9, 2)))).toBe(true);
    expect(isWithinLabHours(toInterval(slot(0, 17, 1)))).toBe(true);
    expect(isWithinLabHours(toInterval(slot(0, 8, 1)))).toBe(false);
    expect(isWithinLabHours(toInterval(slot(0, 17, 2)))).toBe(false);
  });

  it('generates only lab-hour candidate slots', () => {
    const from = campusTime(NOW, 0, 0);
    const slots = [...candidateSlots(from, from + DAY_MS, 1)];
    expect(slots).toHaveLength(9);
    expect(slots.every(isWithinLabHours)).toBe(true);
  });
});

describe('policy.checkFeasibility', () => {
  const base = { now: NOW, user: user(), project: project(), equipment: equipment(), userBookings: [], accessRequests: [] };

  it('passes a valid slot', () => {
    expect(checkFeasibility(toInterval(slot(1, 10)), base)).toEqual([]);
  });

  it('reports every violated rule', () => {
    const v = checkFeasibility(toInterval(slot(-1, 10, 5)), {
      ...base,
      equipment: equipment({ status: 'maintenance', requiresApproval: true, requiredTraining: 'esd' }),
      project: project({ ownerId: 'someone-else' }),
    });
    expect(v).toEqual(
      expect.arrayContaining(['EQUIPMENT_UNAVAILABLE', 'INVALID_DURATION', 'IN_PAST', 'NOT_PROJECT_OWNER', 'TRAINING_REQUIRED', 'APPROVAL_REQUIRED']),
    );
  });

  it('rejects slots after the project deadline', () => {
    expect(checkFeasibility(toInterval(slot(1, 10)), { ...base, project: project({ deadline: slot(1, 9).start }) })).toContain(
      'AFTER_DEADLINE',
    );
  });

  it('allows approval-gated equipment once access is approved', () => {
    const eq = equipment({ requiresApproval: true });
    const approved = { id: 'a', equipmentId: eq.id, userId: 'stu-1', projectId: 'proj-1', justification: 'x', status: 'approved' as const, createdAt: '' };
    expect(checkFeasibility(toInterval(slot(1, 10)), { ...base, equipment: eq, accessRequests: [approved] })).toEqual([]);
  });

  it('enforces the weekly fair-use cap', () => {
    const heavy = Array.from({ length: 4 }, (_, d) => booking({ id: `h${d}`, userId: 'stu-1', ...slot(d + 1, 9, 3) }));
    expect(recentUsageHours(heavy, NOW)).toBe(WEEKLY_HOUR_CAP);
    expect(checkFeasibility(toInterval(slot(6, 14)), { ...base, userBookings: heavy })).toContain('WEEKLY_CAP');
  });
});

describe('allocation.scoreRequest', () => {
  const input = { now: NOW, deadline: NOW + 20 * DAY_MS, usageHours: 0, essential: true, createdAt: NOW };

  it('prioritises closer deadlines', () => {
    expect(scoreRequest({ ...input, deadline: NOW + 2 * DAY_MS }).total).toBeGreaterThan(scoreRequest(input).total);
  });

  it('prioritises students who have used less lab time', () => {
    expect(scoreRequest(input).total).toBeGreaterThan(scoreRequest({ ...input, usageHours: 9 }).total);
  });

  it('prioritises essential equipment over nice-to-have', () => {
    expect(scoreRequest(input).total).toBeGreaterThan(scoreRequest({ ...input, essential: false }).total);
  });

  it('keeps every factor within [0, 1]', () => {
    const s = scoreRequest({ ...input, deadline: NOW - DAY_MS, usageHours: 99, createdAt: NOW - 30 * DAY_MS });
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('allocation.allocate', () => {
  const eqA = equipment();
  const eqB = equipment({ id: 'osc-2', name: 'Oscilloscope B', departmentId: 'eee' });
  const urgent = user({ id: 'stu-2', name: 'Ravi' });
  const ctx = (overrides: Partial<AllocationContext> = {}): AllocationContext => ({
    now: NOW,
    equipment: new Map([eqA, eqB].map((e) => [e.id, e])),
    users: new Map([user(), urgent].map((u) => [u.id, u])),
    projects: new Map(
      [project(), project({ id: 'proj-2', ownerId: 'stu-2', deadline: new Date(NOW + 2 * DAY_MS).toISOString() })].map((p) => [p.id, p]),
    ),
    bookings: [],
    accessRequests: [],
    ...overrides,
  });

  it('grants the contested slot to the most urgent request and offers the other alternatives', () => {
    const relaxed = slotRequest({ id: 'r-early', createdAt: new Date(NOW - 10 * HOUR_MS).toISOString() });
    const pressing = slotRequest({ id: 'r-urgent', userId: 'stu-2', projectId: 'proj-2' });
    const [first, second] = allocate([relaxed, pressing], ctx());

    expect(first?.requestId).toBe('r-urgent');
    expect(first?.outcome.decision).toBe('allocated');
    expect(second?.outcome.decision).toBe('declined');
    expect(second?.outcome.alternatives.length).toBeGreaterThan(0);
    expect(second?.outcome.alternatives.some((a) => a.kind === 'equivalent-equipment' && a.equipmentId === 'osc-2')).toBe(true);
  });

  it('is deterministic regardless of input order', () => {
    const a = slotRequest({ id: 'a' });
    const b = slotRequest({ id: 'b', userId: 'stu-2', projectId: 'proj-2' });
    const ids = (r: ReturnType<typeof allocate>) => r.map((x) => [x.requestId, x.outcome.decision]);
    expect(ids(allocate([a, b], ctx()))).toEqual(ids(allocate([b, a], ctx())));
  });

  it('declines infeasible requests with the reasons', () => {
    const late = slotRequest({ ...slot(1, 18) });
    const [result] = allocate([late], ctx());
    expect(result?.outcome.decision).toBe('declined');
    expect(result?.violations).toContain('OUTSIDE_LAB_HOURS');
  });

  it('never double-books a slot that is already confirmed', () => {
    const [result] = allocate([slotRequest()], ctx({ bookings: [booking()] }));
    expect(result?.outcome.decision).toBe('declined');
  });
});

describe('allocation.findAlternatives', () => {
  it('suggests free slots on the same equipment before the deadline', () => {
    const taken = booking();
    const alts = findAlternatives({
      now: NOW,
      slot: toInterval(taken),
      equipment: equipment(),
      allEquipment: [equipment()],
      bookings: [taken],
      user: user(),
      deadline: NOW + 10 * DAY_MS,
    });
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect(isSlotFree('osc-1', toInterval(a), [taken])).toBe(true);
  });

  it('skips equivalent equipment the user is not trained for', () => {
    const trainingOnly = equipment({ id: 'osc-3', requiredTraining: 'hv' });
    const alts = findAlternatives({
      now: NOW,
      slot: toInterval(slot(1, 10)),
      equipment: equipment({ status: 'maintenance' }),
      allEquipment: [trainingOnly],
      bookings: [],
      user: user(),
      deadline: NOW + 10 * DAY_MS,
    });
    expect(alts).toEqual([]);
  });
});

describe('allocation.conflictGroups', () => {
  it('groups transitively overlapping pending requests per equipment', () => {
    const groups = conflictGroups([
      slotRequest({ id: 'a', ...slot(1, 10, 2) }),
      slotRequest({ id: 'b', ...slot(1, 11, 2) }),
      slotRequest({ id: 'c', ...slot(1, 12, 1) }),
      slotRequest({ id: 'd', ...slot(1, 15, 1) }),
      slotRequest({ id: 'e', ...slot(1, 10, 1), status: 'allocated' }),
    ]);
    expect(groups.map((g) => g.requestIds)).toEqual([['a', 'b', 'c'], ['d']]);
  });
});

describe('utilisation', () => {
  it('computes rates and suggests redirecting demand to idle equivalents', () => {
    const busy = equipment({ id: 'busy', name: 'Busy scope' });
    const idle = equipment({ id: 'idle', name: 'Idle scope' });
    const window = { start: campusTime(NOW, 1, 0), end: campusTime(NOW, 2, 0) };
    const report = utilisationReport(window, [busy, idle], [booking({ equipmentId: 'busy', ...slot(1, 9, 9) })], [{ id: 'ece', name: 'ECE' }]);

    expect(report.equipment.find((e) => e.equipmentId === 'busy')?.rate).toBe(1);
    expect(report.departments[0]?.rate).toBe(0.5);
    expect(report.suggestions[0]).toMatch(/redirect/);
    expect(report.peakHours.find((p) => p.hour === 9)?.bookedHours).toBe(1);
  });
});
