import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createSeed } from './data/seed.js';
import { GeminiAssistant, geminiTransport, RulesAssistant } from './services/ai.js';
import { Store } from './services/store.js';

const config = loadConfig();
const ai = config.geminiApiKey
  ? new GeminiAssistant(geminiTransport(config.geminiApiKey, config.geminiModel), new RulesAssistant(), config.geminiTimeoutMs)
  : new RulesAssistant();

const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp({
  store: new Store(createSeed()),
  ai,
  sessionSecret: config.sessionSecret,
  staticDir: path.resolve(here, '../client'),
});

const server = app.listen(config.port, () => {
  console.log(`LabLink listening on :${config.port} (AI: ${config.geminiApiKey ? config.geminiModel : 'rules fallback'})`);
});

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight requests.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
