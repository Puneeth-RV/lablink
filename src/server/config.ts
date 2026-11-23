import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  SESSION_SECRET: z.string().min(32).optional(),
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  geminiApiKey?: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  sessionSecret: string;
}

/** Validates environment variables once at boot; fails fast on misconfiguration in production. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  if (parsed.NODE_ENV === 'production' && !parsed.SESSION_SECRET) {
    throw new Error('SESSION_SECRET (>= 32 chars) is required in production');
  }
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiModel: parsed.GEMINI_MODEL,
    geminiTimeoutMs: parsed.GEMINI_TIMEOUT_MS,
    // Ephemeral secret outside production: sessions simply reset on restart.
    sessionSecret: parsed.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  };
}
