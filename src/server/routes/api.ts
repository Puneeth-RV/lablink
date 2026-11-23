import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DEMO_USER_IDS } from '../data/seed.js';
import { authenticate, HttpError, parse, requireRole, session } from '../middleware/http.js';
import type { TokenService } from '../services/auth.js';
import type { LabService } from '../services/lab.js';

const id = z.string().trim().min(1).max(64).regex(/^[\w-]+$/, 'Invalid identifier');
const isoDateTime = z.iso.datetime({ offset: true });

const LoginBody = z.object({ userId: id });
const CatalogQuery = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: id.optional(),
  category: z.string().trim().max(64).optional(),
});
const AvailabilityQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD') });
const DiscoverBody = z.object({ query: z.string().trim().min(3, 'Describe what you need').max(500) });
const BookingBody = z
  .object({ equipmentId: id, projectId: id, start: isoDateTime, end: isoDateTime })
  .refine((b) => Date.parse(b.end) > Date.parse(b.start), { message: 'End must be after start', path: ['end'] });
const AccessBody = z.object({
  equipmentId: id,
  projectId: id,
  justification: z.string().trim().min(20, 'Explain your need in at least 20 characters').max(1000),
});
const DecisionBody = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() });
const ResolveBody = z.object({ groupId: z.string().min(1).max(200) });
const IdParam = z.object({ id });
const PlanBody = z.object({ projectId: id, notes: z.string().trim().max(500).optional() });
const FaultBody = z.object({ description: z.string().trim().min(10, 'Describe the fault in at least 10 characters').max(500) });
const FaultAction = z.object({ action: z.enum(['maintenance', 'resolve']) });

export function apiRouter(lab: LabService, tokens: TokenService): Router {
  const router = Router();
  const auth = authenticate(tokens);
  // Gemini-backed endpoints are costlier: tighter per-IP budget.
  const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

  // ---- auth -------------------------------------------------------------
  router.get('/auth/demo-users', (_req, res) => {
    res.json(DEMO_USER_IDS.map((uid) => lab.user(uid)).map(({ id: uid, name, role, departmentId }) => ({ id: uid, name, role, departmentId })));
  });

  router.post('/auth/login', (req, res) => {
    const { userId } = parse(LoginBody, req.body);
    if (!DEMO_USER_IDS.includes(userId)) throw new HttpError(401, 'UNAUTHENTICATED', 'Unknown account');
    const user = lab.user(userId);
    // Return the full profile so the client needs no extra round trip after signing in.
    res.json({ token: tokens.issue(user.id, user.role), profile: lab.profile(user.id) });
  });

  router.get('/me', auth, (_req, res) => {
    res.json(lab.profile(session(res).userId));
  });

  // ---- discovery ------------------------------------------------------------
  router.get('/meta', auth, (_req, res) => {
    res.json(lab.meta());
  });

  router.get('/equipment', auth, (req, res) => {
    res.json(lab.catalog(parse(CatalogQuery, req.query)));
  });

  router.get('/equipment/:id', auth, (req, res) => {
    res.json(lab.getEquipment(parse(IdParam, req.params).id));
  });

  router.get('/equipment/:id/availability', auth, (req, res) => {
    const { id: equipmentId } = parse(IdParam, req.params);
    res.json(lab.availability(equipmentId, parse(AvailabilityQuery, req.query).date));
  });

  router.post('/discover', auth, aiLimiter, async (req, res) => {
    res.json(await lab.discover(parse(DiscoverBody, req.body).query));
  });

  // ---- student flows ------------------------------------------------------------
  router.get('/activity', auth, (_req, res) => {
    res.json(lab.activity(session(res).userId));
  });

  router.post('/bookings', auth, requireRole('student'), (req, res) => {
    const result = lab.createBooking(session(res).userId, parse(BookingBody, req.body));
    res.status(result.kind === 'booked' ? 201 : 202).json(result);
  });

  router.delete('/bookings/:id', auth, requireRole('student'), (req, res) => {
    res.json(lab.cancelBooking(session(res).userId, parse(IdParam, req.params).id));
  });

  router.post('/bookings/:id/check-in', auth, requireRole('student'), (req, res) => {
    res.json(lab.checkIn(session(res).userId, parse(IdParam, req.params).id));
  });

  router.post('/plan', auth, requireRole('student'), aiLimiter, async (req, res) => {
    const { projectId, notes } = parse(PlanBody, req.body);
    res.json(await lab.plan(session(res).userId, projectId, notes));
  });

  router.post('/equipment/:id/faults', auth, (req, res) => {
    const { id: equipmentId } = parse(IdParam, req.params);
    res.status(201).json(lab.reportFault(session(res).userId, equipmentId, parse(FaultBody, req.body).description));
  });

  router.post('/access-requests', auth, requireRole('student'), aiLimiter, async (req, res) => {
    res.status(201).json(await lab.createAccessRequest(session(res).userId, parse(AccessBody, req.body)));
  });

  // ---- faculty flows ------------------------------------------------------------
  router.get('/approvals', auth, requireRole('faculty'), async (_req, res) => {
    res.json(await lab.pendingApprovals(session(res).userId));
  });

  router.post('/approvals/:id', auth, requireRole('faculty'), (req, res) => {
    const { decision, note } = parse(DecisionBody, req.body);
    res.json(lab.decideAccess(session(res).userId, parse(IdParam, req.params).id, decision, note));
  });

  router.get('/conflicts', auth, requireRole('faculty'), (_req, res) => {
    res.json(lab.conflicts(session(res).userId));
  });

  router.post('/conflicts/resolve', auth, requireRole('faculty'), aiLimiter, async (req, res) => {
    res.json(await lab.resolveConflict(session(res).userId, parse(ResolveBody, req.body).groupId));
  });

  router.get('/faults', auth, requireRole('faculty'), (_req, res) => {
    res.json(lab.openFaults(session(res).userId));
  });

  router.post('/faults/:id', auth, requireRole('faculty'), (req, res) => {
    res.json(lab.handleFault(session(res).userId, parse(IdParam, req.params).id, parse(FaultAction, req.body).action));
  });

  router.get('/analytics/utilisation', auth, requireRole('faculty'), (_req, res) => {
    res.json(lab.utilisation());
  });

  router.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Unknown API route')));
  return router;
}
