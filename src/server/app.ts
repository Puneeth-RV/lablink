import compression from 'compression';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { errorHandler } from './middleware/http.js';
import { apiRouter } from './routes/api.js';
import type { AiAssistant } from './services/ai.js';
import { TokenService } from './services/auth.js';
import { LabService } from './services/lab.js';
import type { Store } from './services/store.js';

export interface AppDeps {
  store: Store;
  ai: AiAssistant;
  sessionSecret: string;
  clock?: () => number;
  /** Directory of the built client; omitted in tests/dev. */
  staticDir?: string;
}

/** Builds the Express app from injected dependencies (no globals → easy to test). */
export function createApp({ store, ai, sessionSecret, clock = Date.now, staticDir }: AppDeps): Express {
  const app = express();
  const lab = new LabService(store, ai, clock);
  const tokens = new TokenService(sessionSecret, clock);

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind one Google front-end proxy.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10kb' }));

  // Cloud Run reserves paths ending in 'z' (e.g. /healthz), so health lives under /api.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/api',
    rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', apiRouter(lab, tokens));

  if (staticDir && existsSync(staticDir)) {
    // Hashed assets are immutable; index.html must always revalidate.
    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
    );
    app.use(express.static(staticDir, { index: false, maxAge: '7d' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
