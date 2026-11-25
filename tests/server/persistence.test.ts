import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/server/config.js';
import { createSeed } from '../../src/server/data/seed.js';
import {
  COLLECTIONS,
  pruneWorkingSet,
  SEED_MAX_AGE_MS,
  WriteThroughPersistence,
  type DocumentDb,
} from '../../src/server/services/persistence.js';
import { Store, type CollectionName, type SeedData } from '../../src/server/services/store.js';
import { NOW } from './fixtures.js';

type Entity = { id: string };

/** In-memory stand-in for Firestore implementing the same port. */
class FakeDb implements DocumentDb {
  data = new Map<CollectionName, Map<string, Entity>>();
  meta: { seededAt: string } | null = null;
  failWrites = false;

  async readAll(c: CollectionName) {
    return [...(this.data.get(c)?.values() ?? [])];
  }
  async write(c: CollectionName, e: Entity) {
    if (this.failWrites) throw new Error('unavailable');
    if (!this.data.has(c)) this.data.set(c, new Map());
    this.data.get(c)!.set(e.id, e);
  }
  async replaceAll(seed: SeedData) {
    this.data.clear();
    for (const c of COLLECTIONS) for (const e of seed[c] as Entity[]) await this.write(c, e);
  }
  async getMeta() {
    return this.meta;
  }
  async setMeta(m: { seededAt: string }) {
    this.meta = m;
  }
}

describe('WriteThroughPersistence', () => {
  it('seeds an empty database with demo data', async () => {
    const db = new FakeDb();
    const { data, seeded } = await new WriteThroughPersistence(db).loadOrSeed(createSeed, NOW);
    expect(seeded).toBe(true);
    expect((await db.readAll('equipment')).length).toBe(data.equipment.length);
    expect(db.meta?.seededAt).toBe(new Date(NOW).toISOString());
  });

  it('survives a restart: changes written through are loaded on next boot', async () => {
    const db = new FakeDb();
    const first = new WriteThroughPersistence(db);
    const { data } = await first.loadOrSeed(createSeed, NOW);
    const store = new Store(data, first.listener);
    const booking = store.bookings.insert({
      equipmentId: 'ece-iot-1',
      userId: 'stu-asha',
      projectId: 'proj-asha-iot',
      start: new Date(NOW + 86_400_000).toISOString(),
      end: new Date(NOW + 90_000_000).toISOString(),
      status: 'confirmed',
      createdAt: new Date(NOW).toISOString(),
    });
    store.accessRequests.update('seed-a1', { status: 'approved' });
    await first.flush();

    const { data: reloaded, seeded } = await new WriteThroughPersistence(db).loadOrSeed(
      createSeed,
      NOW + 1000,
    );
    expect(seeded).toBe(false);
    expect(reloaded.bookings.find((b) => b.id === booking.id)).toBeDefined();
    expect(reloaded.accessRequests.find((a) => a.id === 'seed-a1')?.status).toBe('approved');
  });

  it('reseeds stale demo data so dates stay current', async () => {
    const db = new FakeDb();
    await new WriteThroughPersistence(db).loadOrSeed(createSeed, NOW);
    const { seeded } = await new WriteThroughPersistence(db).loadOrSeed(
      createSeed,
      NOW + SEED_MAX_AGE_MS + 1,
    );
    expect(seeded).toBe(true);
  });

  it('keeps serving when writes fail and reports the failure', async () => {
    const db = new FakeDb();
    const log = vi.fn();
    const p = new WriteThroughPersistence(db, log);
    const store = new Store(createSeed(NOW), p.listener);
    db.failWrites = true;
    expect(() => store.bookings.update('seed-b1', { status: 'cancelled' })).not.toThrow();
    await p.flush();
    expect(p.failedWrites).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('bookings/seed-b1'));
    expect(store.bookings.get('seed-b1')?.status).toBe('cancelled');
  });

  it('persists a snapshot, not a live reference', async () => {
    const db = new FakeDb();
    const p = new WriteThroughPersistence(db);
    const store = new Store(createSeed(NOW), p.listener);
    store.bookings.update('seed-b1', { status: 'cancelled' });
    store.bookings.update('seed-b1', { status: 'confirmed' });
    await p.flush();
    expect((await db.readAll('bookings'))[0]).toMatchObject({ id: 'seed-b1', status: 'confirmed' });
  });
});

describe('pruneWorkingSet', () => {
  it('keeps memory bounded by dropping cancelled and old history', () => {
    const seed = createSeed(NOW);
    const old = { ...seed.bookings[0]!, id: 'old', end: new Date(NOW - 40 * 86_400_000).toISOString() };
    const cancelled = { ...seed.bookings[0]!, id: 'cancelled', status: 'cancelled' as const };
    const pruned = pruneWorkingSet({ ...seed, bookings: [...seed.bookings, old, cancelled] }, NOW);
    expect(pruned.bookings.map((b) => b.id)).not.toContain('old');
    expect(pruned.bookings.map((b) => b.id)).not.toContain('cancelled');
    expect(pruned.bookings.length).toBe(seed.bookings.length);
    expect(pruned.equipment).toBe(seed.equipment);
  });
});

describe('config', () => {
  it('applies safe defaults', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      env: 'development',
      port: 8080,
      persistence: 'memory',
      geminiModel: 'gemini-flash-lite-latest',
    });
    expect(c.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('requires a session secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(32), PERSISTENCE: 'firestore' })
        .persistence,
    ).toBe('firestore');
  });

  it('treats blank variables (as in .env.example) as unset', () => {
    const c = loadConfig({
      GEMINI_API_KEY: '',
      SESSION_SECRET: '',
      GOOGLE_CLOUD_PROJECT: '',
      GEMINI_TIMEOUT_MS: '',
      PORT: '',
    });
    expect(c.geminiApiKey).toBeUndefined();
    expect(c.port).toBe(8080);
    expect(c.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ PERSISTENCE: 'mysql' })).toThrow();
    expect(() => loadConfig({ SESSION_SECRET: 'short' })).toThrow();
  });
});
