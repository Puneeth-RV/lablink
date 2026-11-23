import { checkFeasibility, recentUsageHours, WEEKLY_HOUR_CAP, type Violation } from './policy.js';
import { candidateSlots, DAY_MS, HOUR_MS, overlaps, toInterval, toIso } from './time.js';
import type {
  AccessRequest,
  AllocationOutcome,
  Alternative,
  Booking,
  Equipment,
  Interval,
  Project,
  ScoreBreakdown,
  SlotRequest,
  User,
} from './types.js';

/**
 * Weights of the fairness score. Deadline urgency dominates so nobody misses a deadline,
 * but recent usage keeps heavy users from monopolising shared equipment.
 */
export const WEIGHTS = { urgency: 0.4, fairness: 0.25, fit: 0.2, waiting: 0.15 } as const;

/** Deadlines further away than this are treated as not urgent at all. */
const URGENCY_HORIZON_DAYS = 30;
/** Requests waiting this long get the full waiting-time credit. */
const WAITING_SATURATION_HOURS = 48;
const NICE_TO_HAVE_FIT = 0.4;

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface ScoreInput {
  now: number;
  deadline: number;
  usageHours: number;
  essential: boolean;
  createdAt: number;
}

/** Explainable priority score in [0, 1] with per-factor breakdown. */
export function scoreRequest({
  now,
  deadline,
  usageHours,
  essential,
  createdAt,
}: ScoreInput): ScoreBreakdown {
  const daysLeft = (deadline - now) / DAY_MS;
  const urgency = clamp01(1 - daysLeft / URGENCY_HORIZON_DAYS);
  const fairness = clamp01(1 - usageHours / WEEKLY_HOUR_CAP);
  const fit = essential ? 1 : NICE_TO_HAVE_FIT;
  const waiting = clamp01((now - createdAt) / HOUR_MS / WAITING_SATURATION_HOURS);
  const total =
    WEIGHTS.urgency * urgency + WEIGHTS.fairness * fairness + WEIGHTS.fit * fit + WEIGHTS.waiting * waiting;
  return {
    urgency: round(urgency),
    fairness: round(fairness),
    fit: round(fit),
    waiting: round(waiting),
    total: round(total),
  };
}

export function isSlotFree(
  equipmentId: string,
  slot: Interval,
  bookings: Booking[],
  reserved: Interval[] = [],
): boolean {
  const clash = bookings.some(
    (b) => b.status === 'confirmed' && b.equipmentId === equipmentId && overlaps(toInterval(b), slot),
  );
  return !clash && !reserved.some((r) => overlaps(r, slot));
}

export interface AlternativeQuery {
  now: number;
  slot: Interval;
  equipment: Equipment;
  allEquipment: Equipment[];
  bookings: Booking[];
  user: User;
  deadline: number;
  /** Extra intervals on `equipment` already promised in this allocation round. */
  reserved?: Interval[];
  limit?: number;
}

/**
 * Feasible alternatives for a slot that could not be granted:
 * nearest free slots on the same equipment before the deadline, then equivalent
 * equipment (same category) in any department at the originally requested time.
 */
export function findAlternatives(q: AlternativeQuery): Alternative[] {
  const { now, slot, equipment, allEquipment, bookings, user, deadline, reserved = [], limit = 4 } = q;
  const hours = (slot.end - slot.start) / HOUR_MS;
  const results: Alternative[] = [];

  if (equipment.status === 'available') {
    const from = Math.max(now, slot.start - DAY_MS);
    const until = Math.min(deadline, slot.start + 7 * DAY_MS);
    const sameEquipment: Interval[] = [];
    for (const c of candidateSlots(from, until, hours)) {
      if (c.start !== slot.start && isSlotFree(equipment.id, c, bookings, reserved)) sameEquipment.push(c);
    }
    sameEquipment
      .sort((a, b) => Math.abs(a.start - slot.start) - Math.abs(b.start - slot.start) || a.start - b.start)
      .slice(0, Math.ceil(limit / 2))
      .forEach((c) =>
        results.push({
          equipmentId: equipment.id,
          start: toIso(c.start),
          end: toIso(c.end),
          kind: 'same-equipment-later',
        }),
      );
  }

  for (const other of allEquipment) {
    if (results.length >= limit) break;
    if (other.id === equipment.id || other.category !== equipment.category || other.status !== 'available')
      continue;
    if (other.requiredTraining && !user.trainings.includes(other.requiredTraining)) continue;
    if (isSlotFree(other.id, slot, bookings)) {
      results.push({
        equipmentId: other.id,
        start: toIso(slot.start),
        end: toIso(slot.end),
        kind: 'equivalent-equipment',
      });
    }
  }
  return results.slice(0, limit);
}

export interface AllocationContext {
  now: number;
  equipment: Map<string, Equipment>;
  users: Map<string, User>;
  projects: Map<string, Project>;
  bookings: Booking[];
  accessRequests: AccessRequest[];
}

export interface RankedRequest {
  requestId: string;
  score?: ScoreBreakdown;
  violations: Violation[];
  outcome: AllocationOutcome;
}

/**
 * Fairly allocates a group of competing slot requests.
 * 1. Drop infeasible requests (hard rules) — they get violations plus alternatives.
 * 2. Rank feasible requests by score (ties: earlier request, then id — fully deterministic).
 * 3. Grant in rank order while the slot is still free; everyone else gets alternatives.
 */
export function allocate(requests: SlotRequest[], ctx: AllocationContext): RankedRequest[] {
  const reserved = new Map<string, Interval[]>();
  const evaluated = requests.map((req) => {
    const user = ctx.users.get(req.userId);
    const project = ctx.projects.get(req.projectId);
    const equipment = ctx.equipment.get(req.equipmentId);
    if (!user || !project || !equipment) throw new Error(`Slot request ${req.id} references missing data`);
    const userBookings = ctx.bookings.filter((b) => b.userId === user.id);
    const slot = toInterval(req);
    const violations = checkFeasibility(slot, {
      now: ctx.now,
      user,
      project,
      equipment,
      userBookings,
      accessRequests: ctx.accessRequests.filter((a) => a.userId === user.id),
    });
    const score = violations.length
      ? undefined
      : scoreRequest({
          now: ctx.now,
          deadline: Date.parse(project.deadline),
          usageHours: recentUsageHours(userBookings, ctx.now),
          essential: project.essentialCategories.includes(equipment.category),
          createdAt: Date.parse(req.createdAt),
        });
    return { req, user, project, equipment, slot, violations, score };
  });

  const ordered = [...evaluated].sort((a, b) => {
    if (a.score && b.score) {
      return (
        b.score.total - a.score.total ||
        a.req.createdAt.localeCompare(b.req.createdAt) ||
        a.req.id.localeCompare(b.req.id)
      );
    }
    return a.score ? -1 : b.score ? 1 : a.req.id.localeCompare(b.req.id);
  });

  return ordered.map(({ req, user, project, equipment, slot, violations, score }) => {
    const taken = reserved.get(equipment.id) ?? [];
    const granted = !!score && isSlotFree(equipment.id, slot, ctx.bookings, taken);
    if (granted) {
      reserved.set(equipment.id, [...taken, slot]);
      return {
        requestId: req.id,
        score,
        violations,
        outcome: { decision: 'allocated', score, violations: [], alternatives: [] },
      };
    }
    const alternatives = findAlternatives({
      now: ctx.now,
      slot,
      equipment,
      allEquipment: [...ctx.equipment.values()],
      bookings: ctx.bookings,
      user,
      deadline: Date.parse(project.deadline),
      reserved: taken,
    });
    return {
      requestId: req.id,
      score,
      violations,
      outcome: { decision: 'declined', score, violations, alternatives },
    };
  });
}

export interface ConflictGroup {
  id: string;
  equipmentId: string;
  requestIds: string[];
}

/** Groups pending requests on the same equipment whose slots overlap (transitively). */
export function conflictGroups(requests: SlotRequest[]): ConflictGroup[] {
  const byEquipment = new Map<string, SlotRequest[]>();
  for (const r of requests) {
    if (r.status !== 'pending') continue;
    byEquipment.set(r.equipmentId, [...(byEquipment.get(r.equipmentId) ?? []), r]);
  }
  const groups: ConflictGroup[] = [];
  for (const [equipmentId, list] of byEquipment) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    let current: SlotRequest[] = [];
    let currentEnd = -Infinity;
    const flush = () => {
      if (current.length) {
        groups.push({
          id: `${equipmentId}@${current[0]!.start}`,
          equipmentId,
          requestIds: current.map((r) => r.id),
        });
      }
    };
    for (const r of sorted) {
      const { start, end } = toInterval(r);
      if (start < currentEnd) {
        current.push(r);
        currentEnd = Math.max(currentEnd, end);
      } else {
        flush();
        current = [r];
        currentEnd = end;
      }
    }
    flush();
  }
  return groups;
}
