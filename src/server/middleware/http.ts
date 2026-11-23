import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { Role } from '../domain/types.js';
import type { TokenService } from '../services/auth.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`);

/** Parses `data` with `schema` or throws a 400 listing every invalid field. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request is invalid', details);
  }
  return result.data;
}

export interface Session {
  userId: string;
  role: Role;
}

/** Session attached by `authenticate`. */
export function session(res: Response): Session {
  return res.locals.session as Session;
}

export function authenticate(tokens: TokenService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? tokens.verify(token) : null;
    if (!claims) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    res.locals.session = { userId: claims.sub, role: claims.role } satisfies Session;
    next();
  };
}

export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) =>
    session(res).role === role
      ? next()
      : next(new HttpError(403, 'FORBIDDEN', `Only ${role} accounts can do this`));
}

/** Uniform JSON errors; internals are logged, never leaked to clients. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err?.type === 'entity.too.large' || err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed or oversized request body' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
