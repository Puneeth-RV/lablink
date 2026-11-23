import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { createSeed } from '../../src/server/data/seed.js';
import { RulesAssistant } from '../../src/server/services/ai.js';
import { Store } from '../../src/server/services/store.js';
import { campusTime, HOUR_MS, toIso } from '../../src/server/domain/time.js';
import { NOW } from './fixtures.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const at = (day: number, hour: number, hours = 1) => {
  const start = campusTime(NOW, day, hour);
  return { start: toIso(start), end: toIso(start + hours * HOUR_MS) };
};

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({ store: new Store(createSeed(NOW)), ai: new RulesAssistant(), sessionSecret: SECRET, clock: () => NOW });
});

async function login(userId: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ userId }).expect(200);
  return res.body.token as string;
}

describe('health & security headers', () => {
  it('reports healthy with hardened headers', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('authentication', () => {
  it('lists only demo personas without sensitive fields', async () => {
    const res = await request(app).get('/api/auth/demo-users').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Object.keys(res.body[0]).sort()).toEqual(['departmentId', 'id', 'name', 'role']);
  });

  it('rejects unknown users and malformed bodies', async () => {
    await request(app).post('/api/auth/login').send({ userId: 'stu-neha' }).expect(401);
    const bad = await request(app).post('/api/auth/login').send({ userId: '<script>' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires a valid token for protected routes', async () => {
    await request(app).get('/api/me').expect(401);
    await request(app).get('/api/me').set('Authorization', 'Bearer forged.token').expect(401);
  });

  it('rejects oversized payloads', async () => {
    await request(app).post('/api/discover').set('Authorization', `Bearer ${await login('stu-asha')}`).send({ query: 'x'.repeat(20_000) }).expect(400);
  });
});

describe('role-based access control', () => {
  it('blocks students from faculty endpoints and faculty from booking', async () => {
    const student = await login('stu-asha');
    const faculty = await login('fac-iyer');
    await request(app).get('/api/approvals').set('Authorization', `Bearer ${student}`).expect(403);
    await request(app).get('/api/conflicts').set('Authorization', `Bearer ${student}`).expect(403);
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${faculty}`)
      .send({ equipmentId: 'ece-osc-2', projectId: 'proj-asha-iot', ...at(1, 9) })
      .expect(403);
  });
});

describe('discovery', () => {
  it('filters the catalogue', async () => {
    const token = await login('stu-asha');
    const res = await request(app).get('/api/equipment?category=oscilloscope').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.every((e: { category: string }) => e.category === 'oscilloscope')).toBe(true);
  });

  it('recommends equipment from a natural-language need', async () => {
    const token = await login('stu-ravi');
    const res = await request(app).post('/api/discover').set('Authorization', `Bearer ${token}`).send({ query: 'train a deep learning vision model' }).expect(200);
    expect(res.body.matches[0].equipment.category).toBe('gpu-workstation');
  });

  it('shows hourly availability', async () => {
    const token = await login('stu-asha');
    const date = new Date(campusTime(NOW, 1, 12)).toISOString().slice(0, 10);
    const res = await request(app).get(`/api/equipment/ece-osc-1/availability?date=${date}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.slots).toHaveLength(9);
    expect(res.body.slots.find((s: { start: string }) => s.start === at(1, 14).start).status).toBe('booked');
  });
});

describe('booking', () => {
  it('books free normal equipment instantly', async () => {
    const token = await login('stu-asha');
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipmentId: 'ece-iot-1', projectId: 'proj-asha-iot', ...at(1, 9, 2) })
      .expect(201);
    expect(res.body.kind).toBe('booked');
  });

  it('queues high-demand equipment for fair allocation', async () => {
    const token = await login('stu-asha');
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipmentId: 'ece-osc-1', projectId: 'proj-asha-iot', ...at(2, 15) })
      .expect(202);
    expect(res.body.kind).toBe('queued');
  });

  it('returns 409 with alternatives when the slot is taken', async () => {
    const token = await login('stu-asha');
    const body = { equipmentId: 'ece-iot-1', projectId: 'proj-asha-iot', ...at(1, 9, 2) };
    await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send(body).expect(201);
    const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send({ ...body, ...at(1, 10) }).expect(409);
    expect(res.body.error.details.alternatives.length).toBeGreaterThan(0);
  });

  it('returns 422 with reasons and alternatives for infeasible slots', async () => {
    const token = await login('stu-asha');
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipmentId: 'mech-3dp-1', projectId: 'proj-asha-iot', ...at(1, 9) })
      .expect(422);
    expect(res.body.error.details.violations).toContain('Required safety training has not been completed.');
  });

  it('prevents booking for another student’s project', async () => {
    const token = await login('stu-meera');
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipmentId: 'ece-iot-1', projectId: 'proj-asha-iot', ...at(1, 9) })
      .expect(422);
    expect(res.body.error.details.alternatives).toEqual([]);
  });

  it('validates time ranges', async () => {
    const token = await login('stu-asha');
    const { start, end } = at(1, 10);
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ equipmentId: 'ece-iot-1', projectId: 'proj-asha-iot', start: end, end: start })
      .expect(400);
  });

  it('lets students cancel only their own bookings', async () => {
    const asha = await login('stu-asha');
    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${asha}`)
      .send({ equipmentId: 'ece-iot-1', projectId: 'proj-asha-iot', ...at(1, 9) })
      .expect(201);
    const id = created.body.booking.id as string;
    await request(app).delete(`/api/bookings/${id}`).set('Authorization', `Bearer ${await login('stu-ravi')}`).expect(404);
    const res = await request(app).delete(`/api/bookings/${id}`).set('Authorization', `Bearer ${asha}`).expect(200);
    expect(res.body.status).toBe('cancelled');
  });
});

describe('access requests and approvals', () => {
  it('runs the full request → review → approve → book flow', async () => {
    const asha = await login('stu-asha');
    const res = await request(app)
      .post('/api/access-requests')
      .set('Authorization', `Bearer ${asha}`)
      .send({ equipmentId: 'ece-sa-1', projectId: 'proj-asha-iot', justification: 'Measure the 2.4 GHz Wi-Fi emissions of my irrigation node.' })
      .expect(201);
    expect(res.body.aiReview.summary).toContain('Spectrum Analyzer');

    const faculty = await login('fac-iyer');
    const queue = await request(app).get('/api/approvals').set('Authorization', `Bearer ${faculty}`).expect(200);
    expect(queue.body.map((a: { id: string }) => a.id)).toContain(res.body.id);

    await request(app).post(`/api/approvals/${res.body.id}`).set('Authorization', `Bearer ${faculty}`).send({ decision: 'approved' }).expect(200);
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${asha}`)
      .send({ equipmentId: 'ece-sa-1', projectId: 'proj-asha-iot', ...at(1, 9) })
      .expect(201);
  });

  it('hides other departments’ requests from faculty', async () => {
    const mechFaculty = await login('fac-das');
    const res = await request(app).get('/api/approvals').set('Authorization', `Bearer ${mechFaculty}`).expect(200);
    expect(res.body.every((a: { equipmentId: string }) => a.equipmentId.startsWith('mech-'))).toBe(true);
    await request(app).post('/api/approvals/seed-a1').set('Authorization', `Bearer ${mechFaculty}`).send({ decision: 'approved' }).expect(404);
  });

  it('rejects requests for equipment that does not need approval', async () => {
    const asha = await login('stu-asha');
    await request(app)
      .post('/api/access-requests')
      .set('Authorization', `Bearer ${asha}`)
      .send({ equipmentId: 'ece-iot-1', projectId: 'proj-asha-iot', justification: 'A long enough justification text here.' })
      .expect(422);
  });
});

describe('conflict resolution', () => {
  it('previews and commits a fair allocation with an explanation', async () => {
    const faculty = await login('fac-iyer');
    const preview = await request(app).get('/api/conflicts').set('Authorization', `Bearer ${faculty}`).expect(200);
    const group = preview.body[0];
    expect(group.ranking.length).toBeGreaterThan(1);
    expect(group.ranking[0].decision).toBe('allocated');

    const resolved = await request(app).post('/api/conflicts/resolve').set('Authorization', `Bearer ${faculty}`).send({ groupId: group.id }).expect(200);
    expect(resolved.body.explanation).toBeTruthy();

    const after = await request(app).get('/api/conflicts').set('Authorization', `Bearer ${faculty}`).expect(200);
    expect(after.body.find((g: { id: string }) => g.id === group.id)).toBeUndefined();

    const ids: Record<string, string> = { 'Meera Joshi': 'stu-meera', 'Asha Nair': 'stu-asha', 'Ravi Kumar': 'stu-ravi' };
    const winner = await login(ids[group.ranking[0].studentName as string]!);
    const activity = await request(app).get('/api/activity').set('Authorization', `Bearer ${winner}`).expect(200);
    expect(activity.body.slotRequests.some((r: { status: string }) => r.status === 'allocated')).toBe(true);
  });
});

describe('analytics', () => {
  it('reports utilisation with rebalancing suggestions', async () => {
    const faculty = await login('fac-khan');
    const res = await request(app).get('/api/analytics/utilisation').set('Authorization', `Bearer ${faculty}`).expect(200);
    expect(res.body.equipment.length).toBeGreaterThan(0);
    expect(res.body.suggestions.some((s: string) => s.includes('Keysight'))).toBe(true);
  });
});
