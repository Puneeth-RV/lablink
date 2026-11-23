import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from '../domain/types.js';

export interface SessionClaims {
  sub: string;
  role: Role;
  /** Expiry, epoch seconds. */
  exp: number;
}

const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Stateless HMAC-SHA256 signed session tokens (JWT-like, no extra dependency). */
export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly clock: () => number = Date.now,
  ) {}

  issue(sub: string, role: Role): string {
    const claims: SessionClaims = { sub, role, exp: Math.floor(this.clock() / 1000) + SESSION_TTL_SECONDS };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns claims for a valid, unexpired token; otherwise null. Constant-time signature check. */
  verify(token: string): SessionClaims | null {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
      if (typeof claims.sub !== 'string' || (claims.role !== 'student' && claims.role !== 'faculty'))
        return null;
      return claims.exp * 1000 > this.clock() ? claims : null;
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
