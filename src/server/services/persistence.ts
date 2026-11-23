import type { ChangeListener, CollectionName, SeedData } from './store.js';

type Entity = { id: string };

export const COLLECTIONS: CollectionName[] = ['departments', 'users', 'equipment', 'projects', 'bookings', 'slotRequests', 'accessRequests'];

/** Minimal document-database port; Firestore in production, an in-memory fake in tests. */
export interface DocumentDb {
  readAll(collection: CollectionName): Promise<Entity[]>;
  write(collection: CollectionName, entity: Entity): Promise<void>;
  /** Replaces every collection with `data` (used for the initial and refreshed demo seed). */
  replaceAll(data: SeedData): Promise<void>;
  getMeta(): Promise<{ seededAt: string } | null>;
  setMeta(meta: { seededAt: string }): Promise<void>;
}

/** History older than this stays in Firestore but is not loaded into the working set. */
export const WORKING_SET_DAYS = 30;

/**
 * Keeps memory bounded: only active and recent bookings/requests are held in memory.
 * Cancelled or long-finished records remain in Firestore for auditing.
 */
export function pruneWorkingSet(data: SeedData, now: number): SeedData {
  const cutoff = now - WORKING_SET_DAYS * 24 * 60 * 60 * 1000;
  const recent = (end: string) => Date.parse(end) >= cutoff;
  return {
    ...data,
    bookings: data.bookings.filter((b) => b.status === 'confirmed' && recent(b.end)),
    slotRequests: data.slotRequests.filter((r) => recent(r.end)),
    accessRequests: data.accessRequests.filter((a) => a.status !== 'rejected' || recent(a.createdAt)),
  };
}

/** Demo data is reseeded once it is older than this, so relative dates stay realistic. */
export const SEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Write-through persistence: the app serves reads from memory and every mutation is
 * queued to the document database in order. Failures are logged, never thrown into
 * request handling, so a storage hiccup cannot take the app down.
 */
export class WriteThroughPersistence {
  private queue: Promise<void> = Promise.resolve();
  private failures = 0;

  constructor(
    private readonly db: DocumentDb,
    private readonly log: (msg: string) => void = (m) => console.error(m),
  ) {}

  /** Loads persisted data, or seeds fresh demo data when none exists or it is stale. */
  async loadOrSeed(createSeed: (now: number) => SeedData, now: number = Date.now()): Promise<{ data: SeedData; seeded: boolean }> {
    const meta = await this.db.getMeta();
    if (meta && now - Date.parse(meta.seededAt) < SEED_MAX_AGE_MS) {
      const entries = await Promise.all(COLLECTIONS.map(async (c) => [c, await this.db.readAll(c)] as const));
      return { data: pruneWorkingSet(Object.fromEntries(entries) as unknown as SeedData, now), seeded: false };
    }
    const data = createSeed(now);
    await this.db.replaceAll(data);
    await this.db.setMeta({ seededAt: new Date(now).toISOString() });
    return { data, seeded: true };
  }

  /** Store change listener: serialises writes so the latest state always wins. */
  readonly listener: ChangeListener = (collection, entity) => {
    const snapshot = structuredClone(entity);
    this.queue = this.queue.then(() =>
      this.db.write(collection, snapshot).catch((err: Error) => {
        this.failures++;
        this.log(`Persist ${collection}/${entity.id} failed: ${err.message}`);
      }),
    );
  };

  /** Resolves once every queued write has been attempted (used on shutdown and in tests). */
  flush(): Promise<void> {
    return this.queue;
  }

  get failedWrites(): number {
    return this.failures;
  }
}

/** Firestore adapter. Uses the Cloud Run service identity (no keys); loaded lazily. */
export async function createFirestoreDb(projectId?: string): Promise<DocumentDb> {
  const { Firestore } = await import('@google-cloud/firestore');
  const fs = new Firestore({ projectId, ignoreUndefinedProperties: true });
  const meta = fs.collection('meta').doc('seed');

  const commitInChunks = async (ops: ((b: FirebaseFirestore.WriteBatch) => void)[]) => {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = fs.batch();
      ops.slice(i, i + 450).forEach((op) => op(batch));
      await batch.commit();
    }
  };

  return {
    async readAll(collection) {
      const snap = await fs.collection(collection).get();
      return snap.docs.map((d) => d.data() as Entity);
    },
    async write(collection, entity) {
      await fs.collection(collection).doc(entity.id).set(entity);
    },
    async replaceAll(data) {
      const deletes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
      for (const c of COLLECTIONS) {
        const existing = await fs.collection(c).listDocuments();
        existing.forEach((ref) => deletes.push((b) => b.delete(ref)));
      }
      await commitInChunks(deletes);
      const writes = COLLECTIONS.flatMap((c) =>
        (data[c] as Entity[]).map((e) => (b: FirebaseFirestore.WriteBatch) => b.set(fs.collection(c).doc(e.id), e)),
      );
      await commitInChunks(writes);
    },
    async getMeta() {
      const snap = await meta.get();
      return snap.exists ? (snap.data() as { seededAt: string }) : null;
    },
    async setMeta(value) {
      await meta.set(value);
    },
  };
}
