import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createSeed } from './data/seed.js';
import { GeminiAssistant, geminiTransport, RulesAssistant } from './services/ai.js';
import { createFirestoreDb, WriteThroughPersistence } from './services/persistence.js';
import { Store } from './services/store.js';

const config = loadConfig();
const ai = config.geminiApiKey
  ? new GeminiAssistant(
      geminiTransport(config.geminiApiKey, config.geminiModel),
      new RulesAssistant(),
      config.geminiTimeoutMs,
    )
  : new RulesAssistant();

/** Firestore-backed store when enabled; otherwise a fresh in-memory demo (local dev, tests). */
async function createStore(): Promise<{ store: Store; persistence?: WriteThroughPersistence }> {
  if (config.persistence !== 'firestore') return { store: new Store(createSeed()) };
  try {
    const persistence = new WriteThroughPersistence(await createFirestoreDb(config.gcpProject));
    const { data, seeded } = await persistence.loadOrSeed(createSeed);
    console.log(`Firestore ${seeded ? 'seeded with demo data' : 'state loaded'}`);
    return { store: new Store(data, persistence.listener), persistence };
  } catch (err) {
    // Availability over durability: keep serving from memory if Firestore is unreachable.
    console.error(`Firestore unavailable, falling back to in-memory store: ${(err as Error).message}`);
    return { store: new Store(createSeed()) };
  }
}

const { store, persistence } = await createStore();
const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp({
  store,
  ai,
  sessionSecret: config.sessionSecret,
  staticDir: path.resolve(here, '../client'),
});

const server = app.listen(config.port, () => {
  console.log(
    `LabLink listening on :${config.port} (AI: ${config.geminiApiKey ? config.geminiModel : 'rules fallback'}, storage: ${persistence ? 'firestore' : 'memory'})`,
  );
});

// Cloud Run sends SIGTERM before stopping an instance: finish requests and pending writes.
process.on('SIGTERM', () => {
  server.close(() => {
    void (persistence?.flush() ?? Promise.resolve()).finally(() => process.exit(0));
  });
});
