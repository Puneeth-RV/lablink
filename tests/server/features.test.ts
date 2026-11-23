import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { createSeed } from '../../src/server/data/seed.js';
import { canCheckIn, findNoShows, NO_SHOW_GRACE_MS } from '../../src/server/domain/checkin.js';
import { planSchedule } from '../../src/server/domain/planner.js';
import { campusTime, DAY_MS, HOUR_MS, toIso } from '../../src/server/domain/time.js';
import { GeminiAssistant, RulesAssistant } from '../../src/server/services/ai.js';
import { Store } from '../../src/server/services/store.js';
import { booking, equipment, NOW, project, slot, user } from './fixtures.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

describe('check-in and no-show release', () => {
  const b = booking({ ...slot(0, 10, 2) });
  const start = Date.parse(b.start);

  it('opens check-in 10 minutes before and closes 15 minutes after the start', () => {
    expect(canCheckIn(b, start - 11 * 60_000)).toBe(false);
    expect(canCheckIn(b, start - 5 * 60_000)).toBe(true);
    expect(canCheckIn(b, start + NO_SHOW_GRACE_MS + 1)).toBe(false);
    expect(canCheckIn({ ...b, checkedInAt: 'x' }, start)).toBe(false);
  });

  it('releases only running slots whose holder never checked in', () => {
    const during = start + NO_SHOW_GRACE_MS + 60_000;
    expect(findNoShows([b], during)).toHaveLength(1);
    expect(findNoShows([{ ...b, checkedInAt: 'x' }], during)).toHaveLength(0);
    expect(findNoShows([b], start + 5 * 60_000)).toHaveLength(0);
    expect(findNoShows([b], Date.parse(b.end) + 1)).toHaveLength(0);
  });
});

describe('planner.planSchedule', () => {
  const scope = equipment();
  const printer = equipment({
    id: 'p1',
    name: 'Printer',
    category: '3d-printer',
    requiredTraining: 'fab',
    maxSlotHours: 6,
  });
  const ctx = {
    now: NOW,
    user: user(),
    project: project(),
    equipment: [scope, printer],
    bookings: [],
    accessRequests: [],
  };

  it('schedules the earliest feasible slot before the deadline', () => {
    const [item] = planSchedule([{ category: 'oscilloscope', hours: 2, reason: 'debug' }], ctx);
    expect(item?.equipmentId).toBe('osc-1');
    expect(item?.start).toBe(toIso(campusTime(NOW, 0, 9)));
    expect(item?.issues).toEqual([]);
  });

  it('never double-books the student or the equipment', () => {
    const taken = booking({ ...slot(0, 9, 3) });
    const [a, b] = planSchedule(
      [
        { category: 'oscilloscope', hours: 1, reason: 'a' },
        { category: 'oscilloscope', hours: 1, reason: 'b' },
      ],
      { ...ctx, bookings: [taken] },
    );
    expect(a?.start).toBe(toIso(campusTime(NOW, 0, 12)));
    expect(b?.start).toBe(toIso(campusTime(NOW, 0, 13)));
  });

  it('explains needs it cannot schedule', () => {
    const [training, missing] = planSchedule(
      [
        { category: '3d-printer', hours: 2, reason: 'parts' },
        { category: 'telescope', hours: 1, reason: 'x' },
      ],
      ctx,
    );
    expect(training?.issues.join(' ')).toMatch(/training/);
    expect(missing?.issues[0]).toMatch(/No equipment/);
  });

  it('respects the weekly fair-use cap', () => {
    const heavy = Array.from({ length: 4 }, (_, d) =>
      booking({ id: `h${d}`, userId: 'stu-1', ...slot(d + 1, 9, 3) }),
    );
    const [item] = planSchedule([{ category: 'oscilloscope', hours: 2, reason: 'x' }], {
      ...ctx,
      bookings: heavy,
    });
    expect(item?.issues[0]).toMatch(/fair-use cap/);
  });
});

describe('GeminiAssistant.planNeeds', () => {
  const input = {
    projectTitle: 'P',
    description: 'D',
    categories: ['oscilloscope'],
    essentialCategories: ['oscilloscope'],
  };

  it('keeps only known, unique categories', async () => {
    const generate = vi.fn().mockResolvedValue(
      JSON.stringify({
        needs: [
          { category: 'oscilloscope', hours: 2, reason: 'r' },
          { category: 'oscilloscope', hours: 1, reason: 'dup' },
          { category: 'laser', hours: 1, reason: 'x' },
        ],
      }),
    );
    const res = await new GeminiAssistant(generate, new RulesAssistant(), 1000, () => undefined).planNeeds(
      input,
    );
    expect(res).toEqual({ source: 'gemini', needs: [{ category: 'oscilloscope', hours: 2, reason: 'r' }] });
  });

  it('falls back to essential categories', async () => {
    const res = await new GeminiAssistant(
      vi.fn().mockRejectedValue(new Error('x')),
      new RulesAssistant(),
      1000,
      () => undefined,
    ).planNeeds(input);
    expect(res.source).toBe('rules');
    expect(res.needs[0]?.category).toBe('oscilloscope');
  });
});

describe('API: planner, check-in and fault reports', () => {
  const setup = (now = NOW) => {
    const app = createApp({
      store: new Store(createSeed(now)),
      ai: new RulesAssistant(),
      sessionSecret: SECRET,
      clock: () => now,
    });
    const login = async (userId: string) =>
      (await request(app).post('/api/auth/login').send({ userId })).body.token as string;
    return { app, login };
  };

  it('plans a project schedule for the owner only', async () => {
    const { app, login } = setup();
    const asha = await login('stu-asha');
    const res = await request(app)
      .post('/api/plan')
      .set('Authorization', `Bearer ${asha}`)
      .send({ projectId: 'proj-asha-iot' })
      .expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.some((i: { start?: string }) => i.start)).toBe(true);
    await request(app)
      .post('/api/plan')
      .set('Authorization', `Bearer ${asha}`)
      .send({ projectId: 'proj-ravi-ml' })
      .expect(403);
  });

  it('checks in during the window and releases no-shows afterwards', async () => {
    const start = campusTime(NOW, 1, 10);
    const early = setup(start - DAY_MS);
    const asha = await early.login('stu-asha');
    const created = await request(early.app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${asha}`)
      .send({
        equipmentId: 'ece-iot-1',
        projectId: 'proj-asha-iot',
        start: toIso(start),
        end: toIso(start + 2 * HOUR_MS),
      })
      .expect(201);
    await request(early.app)
      .post(`/api/bookings/${created.body.booking.id}/check-in`)
      .set('Authorization', `Bearer ${asha}`)
      .expect(409);
  });

  it('lets anyone report a fault and department faculty take it offline then resolve it', async () => {
    const { app, login } = setup();
    const asha = await login('stu-asha');
    const report = await request(app)
      .post('/api/equipment/ece-iot-1/faults')
      .set('Authorization', `Bearer ${asha}`)
      .send({ description: 'Soil sensor reads 0 always' })
      .expect(201);
    await request(app)
      .post('/api/equipment/ece-iot-1/faults')
      .set('Authorization', `Bearer ${asha}`)
      .send({ description: 'Soil sensor reads 0 always' })
      .expect(409);
    await request(app)
      .post('/api/equipment/ece-iot-1/faults')
      .set('Authorization', `Bearer ${asha}`)
      .send({ description: 'bad' })
      .expect(400);

    const other = await login('fac-das');
    await request(app)
      .post(`/api/faults/${report.body.id}`)
      .set('Authorization', `Bearer ${other}`)
      .send({ action: 'maintenance' })
      .expect(404);
    await request(app).get('/api/faults').set('Authorization', `Bearer ${asha}`).expect(403);

    const iyer = await login('fac-iyer');
    const open = await request(app).get('/api/faults').set('Authorization', `Bearer ${iyer}`).expect(200);
    expect(open.body.map((f: { id: string }) => f.id)).toContain(report.body.id);
    await request(app)
      .post(`/api/faults/${report.body.id}`)
      .set('Authorization', `Bearer ${iyer}`)
      .send({ action: 'maintenance' })
      .expect(200);
    expect(
      (await request(app).get('/api/equipment/ece-iot-1').set('Authorization', `Bearer ${iyer}`)).body.status,
    ).toBe('maintenance');
    await request(app)
      .post(`/api/faults/${report.body.id}`)
      .set('Authorization', `Bearer ${iyer}`)
      .send({ action: 'resolve' })
      .expect(200);
    expect(
      (await request(app).get('/api/equipment/ece-iot-1').set('Authorization', `Bearer ${iyer}`)).body.status,
    ).toBe('available');
    await request(app)
      .post(`/api/faults/${report.body.id}`)
      .set('Authorization', `Bearer ${iyer}`)
      .send({ action: 'resolve' })
      .expect(409);
  });
});

describe('API: no-show release frees the slot', () => {
  it('releases a missed booking so others can book the remainder', async () => {
    const start = campusTime(NOW, 1, 10);
    let now = start - DAY_MS;
    const store = new Store(createSeed(NOW));
    const app = createApp({ store, ai: new RulesAssistant(), sessionSecret: SECRET, clock: () => now });
    const token = (await request(app).post('/api/auth/login').send({ userId: 'stu-asha' })).body
      .token as string;
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        equipmentId: 'ece-iot-1',
        projectId: 'proj-asha-iot',
        start: toIso(start),
        end: toIso(start + 2 * HOUR_MS),
      })
      .expect(201);
    now = start + NO_SHOW_GRACE_MS + 60_000;
    // A day later the old session has expired (8 h TTL), so sign in again.
    const fresh = (await request(app).post('/api/auth/login').send({ userId: 'stu-asha' })).body
      .token as string;
    const activity = await request(app)
      .get('/api/activity')
      .set('Authorization', `Bearer ${fresh}`)
      .expect(200);
    expect(
      activity.body.bookings.find((b: { equipmentId: string }) => b.equipmentId === 'ece-iot-1'),
    ).toBeUndefined();
    expect(store.bookings.list((b) => b.status === 'no-show')).toHaveLength(1);
  });
});

describe('free-text projects', () => {
  it('parses deadlines deterministically in the fallback', async () => {
    const { parseDeadline } = await import('../../src/server/services/ai.js');
    expect(parseDeadline('due 2026-12-05', '2026-11-23')).toBe('2026-12-05');
    expect(parseDeadline('submit in 2 weeks', '2026-11-23')).toBe('2026-12-07');
    expect(parseDeadline('due 5th december', '2026-11-23')).toBe('2026-12-05');
    expect(parseDeadline('deadline january 10', '2026-11-23')).toBe('2027-01-10');
    expect(parseDeadline('no date here', '2026-11-23')).toBeNull();
  });

  it('creates a validated project for the student and plans it', async () => {
    const app = createApp({
      store: new Store(createSeed(NOW)),
      ai: new RulesAssistant(),
      sessionSecret: SECRET,
      clock: () => NOW,
    });
    const token = (await request(app).post('/api/auth/login').send({ userId: 'stu-asha' })).body
      .token as string;
    const auth = { Authorization: `Bearer ${token}` };

    const res = await request(app)
      .post('/api/projects')
      .set(auth)
      .send({
        description: 'Line follower robot using an oscilloscope to tune the motor driver, due in 2 weeks',
      })
      .expect(201);
    expect(res.body).toMatchObject({ ownerId: 'stu-asha', supervisorId: 'fac-iyer', source: 'rules' });
    expect(res.body.essentialCategories).toContain('oscilloscope');
    expect(Date.parse(res.body.deadline)).toBeGreaterThan(NOW + 13 * DAY_MS);

    const me = await request(app).get('/api/me').set(auth).expect(200);
    expect(me.body.projects.map((p: { id: string }) => p.id)).toContain(res.body.id);
    const plan = await request(app).post('/api/plan').set(auth).send({ projectId: res.body.id }).expect(200);
    expect(plan.body.items[0].category).toBe('oscilloscope');
  });

  it('rejects descriptions without a valid future deadline', async () => {
    const app = createApp({
      store: new Store(createSeed(NOW)),
      ai: new RulesAssistant(),
      sessionSecret: SECRET,
      clock: () => NOW,
    });
    const token = (await request(app).post('/api/auth/login').send({ userId: 'stu-asha' })).body
      .token as string;
    const missing = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'A robot that sorts recyclable waste automatically' })
      .expect(422);
    expect(missing.body.error.code).toBe('DEADLINE_MISSING');
    await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'A robot that sorts waste, due 2020-01-01 at noon' })
      .expect(422);
    const faculty = (await request(app).post('/api/auth/login').send({ userId: 'fac-iyer' })).body
      .token as string;
    await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${faculty}`)
      .send({ description: 'A robot that sorts waste, due in 2 weeks' })
      .expect(403);
  });
});
