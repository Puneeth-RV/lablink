/**
 * AI assistant public API. Implementation is split by responsibility:
 * - ai/types.ts      contracts shared by both assistants
 * - ai/rules.ts      deterministic fallback (no LLM)
 * - ai/text.ts       tokenising and deadline parsing used by the fallback
 * - ai/gemini.ts     Gemini assistant: prompts, schemas, validation, fallback
 * - ai/cache.ts      TTL + size-bounded response cache
 * - ai/transport.ts  Google GenAI SDK transport
 */
export * from './ai/types.js';
export { parseDeadline } from './ai/text.js';
export { RulesAssistant } from './ai/rules.js';
export { TtlCache } from './ai/cache.js';
export { GeminiAssistant } from './ai/gemini.js';
export { geminiTransport } from './ai/transport.js';
