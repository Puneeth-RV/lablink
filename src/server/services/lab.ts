import { allocate, conflictGroups, findAlternatives, isSlotFree, type AllocationContext } from '../domain/allocation.js';
import { canCheckIn, findNoShows } from '../domain/checkin.js';
import { planSchedule } from '../domain/planner.js';
import { checkFeasibility, describeViolations, recentUsageHours, WEEKLY_HOUR_CAP } from '../domain/policy.js';
import { DAY_MS, HOUR_MS, LAB_CLOSE_HOUR, LAB_OPEN_HOUR, overlaps, toInterval, toIso } from '../domain/time.js';
import type { AccessRequest, Booking, Equipment, FaultReport, Project, SlotRequest, User } from '../domain/types.js';
import { utilisationReport } from '../domain/utilisation.js';
import { HttpError, notFound } from '../middleware/http.js';
import type { AiAssistant } from './ai.js';
import type { Store } from './store.js';

export interface BookingInput {
  equipmentId: string;
  projectId: string;
  start: string;
  end: string;
}

export interface AccessRequestInput {
  equipmentId: string;
  projectId: string;
  justification: string;
}

export interface CatalogFilter {
  q?: string;
  departmentId?: string;
  category?: string;
}

const IST_SUFFIX = 'T00:00:00+05:30';

/**
 * Application service: orchestrates the store, pure domain rules and the AI assistant.
 * Routes stay thin; every business rule lives in `domain/`.
 */
export class LabService {
  constructor(
    private readonly store: Store,
    private readonly ai: AiAssistant,
    private readonly clock: () => number = Date.now,
  ) {}

  // ---- lookups -----------------------------------------------------------

  user(id: string): User {
    return this.store.users.get(id) ?? (() => { throw notFound('User'); })();
  }

  private equipment(id: string): Equipment {
    return this.store.equipment.get(id) ?? (() => { throw notFound('Equipment'); })();
  }

  private project(id: string): Project {
    return this.store.projects.get(id) ?? (() => { throw notFound('Project'); })();
  }

  private label(slot: { start: string; end: string }): string {
    const fmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const end = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fmt.format(new Date(slot.start))}–${end.format(new Date(slot.end))}`;
  }

  private allocationContext(): AllocationContext {
    return {
      now: this.clock(),
      equipment: this.store.equipment.asMap(),
      users: this.store.users.asMap(),
      projects: this.store.projects.asMap(),
      bookings: this.store.bookings.list(),
      accessRequests: this.store.accessRequests.list(),
    };
  }

  // ---- profile & catalogue ------------------------------------------------

  profile(userId: string) {
    const user = this.user(userId);
    const projects = this.store.projects.list((p) => p.ownerId === userId);
    const usage = recentUsageHours(this.store.bookings.list((b) => b.userId === userId), this.clock());
    return { user, projects, usage: { hours: usage, cap: WEEKLY_HOUR_CAP } };
  }

  meta() {
    return {
      departments: this.store.departments.list(),
      categories: [...new Set(this.store.equipment.list().map((e) => e.category))].sort(),
    };
  }

  catalog({ q, departmentId, category }: CatalogFilter): Equipment[] {
    const needle = q?.toLowerCase().trim();
    return this.store.equipment.list(
      (e) =>
        (!departmentId || e.departmentId === departmentId) &&
        (!category || e.category === category) &&
        (!needle || [e.name, e.category, e.description, ...e.capabilities].some((t) => t.toLowerCase().includes(needle))),
    );
  }

  getEquipment(id: string): Equipment {
    return this.equipment(id);
  }

  /** Lazily releases slots whose holder missed check-in; returns how many were released. */
  releaseNoShows(): number {
    const released = findNoShows(this.store.bookings.list(), this.clock());
    for (const b of released) this.store.bookings.update(b.id, { status: 'no-show' });
    return released.length;
  }

  /** Hourly status of one campus day for an item. */
  availability(equipmentId: string, date: string) {
    this.releaseNoShows();
    const equipment = this.equipment(equipmentId);
    const dayStart = Date.parse(`${date}${IST_SUFFIX}`);
    if (Number.isNaN(dayStart)) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid date');
    const bookings = this.store.bookings.list((b) => b.equipmentId === equipmentId && b.status === 'confirmed');
    const pending = this.store.slotRequests.list((r) => r.equipmentId === equipmentId && r.status === 'pending');
    const slots = [];
    for (let hour = LAB_OPEN_HOUR; hour < LAB_CLOSE_HOUR; hour++) {
      const slot = { start: dayStart + hour * HOUR_MS, end: dayStart + (hour + 1) * HOUR_MS };
      const requested = pending.filter((r) => overlaps(toInterval(r), slot)).length;
      const status =
        equipment.status !== 'available'
          ? 'unavailable'
          : slot.start < this.clock()
            ? 'past'
            : bookings.some((b) => overlaps(toInterval(b), slot))
              ? 'booked'
              : 'free';
      slots.push({ start: toIso(slot.start), end: toIso(slot.end), status, requested });
    }
    return { equipmentId, date, slots };
  }

  async discover(query: string) {
    const catalog = this.store.equipment.list();
    const result = await this.ai.discover(query, catalog);
    return {
      source: result.source,
      matches: result.matches.map((m) => ({ ...m, equipment: this.equipment(m.equipmentId) })),
    };
  }

  // ---- booking -------------------------------------------------------------

  /**
   * Instant booking for normal equipment; fair-queue request for high-demand equipment.
   * Infeasible or clashing requests are rejected with actionable alternatives.
   */
  createBooking(userId: string, input: BookingInput): { kind: 'booked'; booking: Booking } | { kind: 'queued'; request: SlotRequest } {
    this.releaseNoShows();
    const now = this.clock();
    const user = this.user(userId);
    const equipment = this.equipment(input.equipmentId);
    const project = this.project(input.projectId);
    const slot = toInterval(input);
    const bookings = this.store.bookings.list();
    const alternatives = () =>
      findAlternatives({ now, slot, equipment, allEquipment: this.store.equipment.list(), bookings, user, deadline: Date.parse(project.deadline) });

    const violations = checkFeasibility(slot, {
      now,
      user,
      project,
      equipment,
      userBookings: bookings.filter((b) => b.userId === userId),
      accessRequests: this.store.accessRequests.list((a) => a.userId === userId),
    });
    if (violations.length) {
      throw new HttpError(422, 'NOT_FEASIBLE', 'This slot cannot be booked', {
        violations: describeViolations(violations),
        alternatives: violations.includes('NOT_PROJECT_OWNER') ? [] : alternatives(),
      });
    }
    if (!isSlotFree(equipment.id, slot, bookings)) {
      throw new HttpError(409, 'SLOT_TAKEN', 'That slot is already booked', { violations: [], alternatives: alternatives() });
    }

    const base = { equipmentId: equipment.id, userId, projectId: project.id, start: toIso(slot.start), end: toIso(slot.end), createdAt: toIso(now) };
    if (equipment.highDemand) {
      const duplicate = this.store.slotRequests.list(
        (r) => r.userId === userId && r.equipmentId === equipment.id && r.status === 'pending' && overlaps(toInterval(r), slot),
      );
      if (duplicate.length) throw new HttpError(409, 'DUPLICATE_REQUEST', 'You already requested this slot');
      return { kind: 'queued', request: this.store.slotRequests.insert({ ...base, status: 'pending' }) };
    }
    return { kind: 'booked', booking: this.store.bookings.insert({ ...base, status: 'confirmed' }) };
  }

  cancelBooking(userId: string, bookingId: string): Booking {
    const booking = this.store.bookings.get(bookingId);
    if (!booking || booking.userId !== userId) throw notFound('Booking');
    if (booking.status === 'cancelled') return booking;
    return this.store.bookings.update(bookingId, { status: 'cancelled' });
  }

  checkIn(userId: string, bookingId: string): Booking {
    const booking = this.store.bookings.get(bookingId);
    if (!booking || booking.userId !== userId) throw notFound('Booking');
    if (!canCheckIn(booking, this.clock())) {
      throw new HttpError(409, 'CHECK_IN_CLOSED', 'Check-in opens 10 minutes before the slot and closes 15 minutes after it starts');
    }
    return this.store.bookings.update(bookingId, { checkedInAt: toIso(this.clock()) });
  }

  activity(userId: string) {
    this.releaseNoShows();
    const name = (id: string) => this.store.equipment.get(id)?.name ?? id;
    const title = (id: string) => this.store.projects.get(id)?.title ?? id;
    const byStart = <T extends { start: string }>(a: T, b: T) => a.start.localeCompare(b.start);
    return {
      bookings: this.store.bookings
        .list((b) => b.userId === userId && b.status === 'confirmed' && Date.parse(b.end) > this.clock() - DAY_MS)
        .sort(byStart)
        .map((b) => ({
          ...b,
          equipmentName: name(b.equipmentId),
          projectTitle: title(b.projectId),
          label: this.label(b),
          upcoming: Date.parse(b.start) > this.clock(),
          canCheckIn: canCheckIn(b, this.clock()),
        })),
      slotRequests: this.store.slotRequests
        .list((r) => r.userId === userId)
        .sort(byStart)
        .map((r) => ({
          ...r,
          equipmentName: name(r.equipmentId),
          projectTitle: title(r.projectId),
          label: this.label(r),
          alternatives: (r.outcome?.alternatives ?? []).map((a) => ({ ...a, equipmentName: name(a.equipmentId), label: this.label(a) })),
        })),
      accessRequests: this.store.accessRequests
        .list((a) => a.userId === userId)
        .map((a) => ({ ...a, equipmentName: name(a.equipmentId), projectTitle: title(a.projectId) })),
    };
  }

  // ---- access requests & approvals ---------------------------------------------

  async createAccessRequest(userId: string, input: AccessRequestInput): Promise<AccessRequest> {
    const user = this.user(userId);
    const equipment = this.equipment(input.equipmentId);
    const project = this.project(input.projectId);
    if (project.ownerId !== userId) throw new HttpError(403, 'FORBIDDEN', 'You can only request access for your own project');
    if (!equipment.requiresApproval) throw new HttpError(422, 'NOT_REQUIRED', 'This equipment can be booked without approval');
    const existing = this.store.accessRequests.list(
      (a) => a.userId === userId && a.equipmentId === equipment.id && a.projectId === project.id && a.status !== 'rejected',
    );
    if (existing.length) throw new HttpError(409, 'DUPLICATE_REQUEST', `An access request is already ${existing[0]!.status}`);

    const aiReview = await this.ai.reviewAccessRequest({
      equipment,
      projectTitle: project.title,
      projectDescription: project.description,
      daysToDeadline: (Date.parse(project.deadline) - this.clock()) / DAY_MS,
      justification: input.justification,
      hasTraining: !equipment.requiredTraining || user.trainings.includes(equipment.requiredTraining),
    });
    return this.store.accessRequests.insert({ ...input, userId, status: 'pending', createdAt: toIso(this.clock()), aiReview });
  }

  /** Faculty only see requests for equipment owned by their department. */
  private inScope(facultyId: string, equipmentId: string): boolean {
    return this.equipment(equipmentId).departmentId === this.user(facultyId).departmentId;
  }

  async pendingApprovals(facultyId: string) {
    const pending = this.store.accessRequests.list((a) => a.status === 'pending' && this.inScope(facultyId, a.equipmentId));
    // Older seeded requests may lack a review: generate them in parallel, then persist.
    await Promise.all(
      pending
        .filter((x) => !x.aiReview)
        .map(async (a) => {
          const user = this.user(a.userId);
          const equipment = this.equipment(a.equipmentId);
          const project = this.project(a.projectId);
          const aiReview = await this.ai.reviewAccessRequest({
            equipment,
            projectTitle: project.title,
            projectDescription: project.description,
            daysToDeadline: (Date.parse(project.deadline) - this.clock()) / DAY_MS,
            justification: a.justification,
            hasTraining: !equipment.requiredTraining || user.trainings.includes(equipment.requiredTraining),
          });
          this.store.accessRequests.update(a.id, { aiReview });
        }),
    );
    return this.store.accessRequests
      .list((a) => a.status === 'pending' && this.inScope(facultyId, a.equipmentId))
      .map((a) => ({
        ...a,
        studentName: this.user(a.userId).name,
        equipmentName: this.equipment(a.equipmentId).name,
        projectTitle: this.project(a.projectId).title,
        deadline: this.project(a.projectId).deadline,
      }));
  }

  decideAccess(facultyId: string, requestId: string, decision: 'approved' | 'rejected', note?: string): AccessRequest {
    const request = this.store.accessRequests.get(requestId);
    if (!request || !this.inScope(facultyId, request.equipmentId)) throw notFound('Access request');
    if (request.status !== 'pending') throw new HttpError(409, 'ALREADY_DECIDED', `Request was already ${request.status}`);
    return this.store.accessRequests.update(requestId, { status: decision, decidedBy: facultyId, decisionNote: note });
  }

  // ---- conflicts ---------------------------------------------------------------

  /** Pending contested requests in the faculty member's department, with a dry-run of the fair allocation. */
  conflicts(facultyId: string) {
    const pending = this.store.slotRequests.list((r) => r.status === 'pending' && this.inScope(facultyId, r.equipmentId));
    const ctx = this.allocationContext();
    return conflictGroups(pending).map((group) => {
      const requests = group.requestIds.map((id) => this.store.slotRequests.get(id)!);
      return { ...group, ...this.describeGroup(requests, allocate(requests, ctx)) };
    });
  }

  private describeGroup(requests: SlotRequest[], ranked: ReturnType<typeof allocate>) {
    const equipment = this.equipment(requests[0]!.equipmentId);
    const span = {
      start: requests.map((r) => r.start).sort()[0]!,
      end: requests.map((r) => r.end).sort().at(-1)!,
    };
    return {
      equipmentName: equipment.name,
      label: this.label(span),
      ranking: ranked.map((r) => {
        const req = requests.find((x) => x.id === r.requestId)!;
        const project = this.project(req.projectId);
        return {
          requestId: r.requestId,
          studentName: this.user(req.userId).name,
          projectTitle: project.title,
          deadline: project.deadline,
          label: this.label(req),
          score: r.score,
          decision: r.outcome.decision,
          violations: describeViolations(r.violations),
          alternatives: r.outcome.alternatives.map((a) => ({ ...a, equipmentName: this.equipment(a.equipmentId).name, label: this.label(a) })),
        };
      }),
    };
  }

  /** Commits the fair allocation for one conflict group and explains it. */
  async resolveConflict(facultyId: string, groupId: string) {
    const group = this.conflicts(facultyId).find((g) => g.id === groupId);
    if (!group) throw notFound('Conflict');
    const requests = group.requestIds.map((id) => this.store.slotRequests.get(id)!);
    const ranked = allocate(requests, this.allocationContext());
    const described = this.describeGroup(requests, ranked);

    const explanation = await this.ai.explainAllocation({
      equipmentName: described.equipmentName,
      slotLabel: described.label,
      entries: described.ranking.map((r) => ({
        studentName: r.studentName,
        projectTitle: r.projectTitle,
        decision: r.decision,
        score: r.score,
        violations: r.violations,
        alternativeCount: r.alternatives.length,
      })),
    });

    for (const r of ranked) {
      const req = this.store.slotRequests.get(r.requestId)!;
      if (r.outcome.decision === 'allocated') {
        this.store.bookings.insert({ equipmentId: req.equipmentId, userId: req.userId, projectId: req.projectId, start: req.start, end: req.end, status: 'confirmed', createdAt: toIso(this.clock()) });
      }
      this.store.slotRequests.update(req.id, {
        status: r.outcome.decision,
        outcome: { ...r.outcome, violations: describeViolations(r.violations), explanation: explanation.text },
      });
    }
    return { ...group, ...described, explanation: explanation.text, explanationSource: explanation.source };
  }

  // ---- projects from free text --------------------------------------------------------

  /**
   * Creates a project from a free-form description. Gemini extracts title, deadline and the
   * equipment categories needed; the server validates every field before saving.
   */
  async createProject(userId: string, description: string): Promise<Project & { source: 'gemini' | 'rules' }> {
    const user = this.user(userId);
    const now = this.clock();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(now));
    const draft = await this.ai.draftProject({
      description,
      today,
      categories: [...new Set(this.store.equipment.list((e) => e.status === 'available').map((e) => e.category))].sort(),
    });
    if (!draft.deadline) {
      throw new HttpError(422, 'DEADLINE_MISSING', 'Mention when the project is due, e.g. "due 5 December" or "in 2 weeks"');
    }
    const deadline = Date.parse(`${draft.deadline}T18:00:00+05:30`);
    if (Number.isNaN(deadline) || deadline <= now || deadline > now + 180 * DAY_MS) {
      throw new HttpError(422, 'DEADLINE_INVALID', 'The deadline must be a future date within the next 6 months');
    }
    const supervisor =
      this.store.users.list((u) => u.role === 'faculty' && u.departmentId === user.departmentId)[0] ?? this.store.users.list((u) => u.role === 'faculty')[0];
    const project = this.store.projects.insert({
      title: draft.title,
      description,
      ownerId: userId,
      supervisorId: supervisor?.id ?? '',
      deadline: toIso(deadline),
      essentialCategories: draft.essentialCategories,
    });
    return { ...project, source: draft.source };
  }

  // ---- AI project planner ----------------------------------------------------------

  /** Gemini infers equipment needs from the project; the planner finds feasible slots for each. */
  async plan(userId: string, projectId: string, notes?: string) {
    const user = this.user(userId);
    const project = this.project(projectId);
    if (project.ownerId !== userId) throw new HttpError(403, 'FORBIDDEN', 'You can only plan your own project');
    const equipment = this.store.equipment.list((e) => e.status === 'available');
    const { needs, source } = await this.ai.planNeeds({
      projectTitle: project.title,
      description: [project.description, notes].filter(Boolean).join('\n'),
      categories: [...new Set(equipment.map((e) => e.category))],
      essentialCategories: project.essentialCategories,
    });
    const items = planSchedule(needs, {
      now: this.clock(),
      user,
      project,
      equipment,
      bookings: this.store.bookings.list(),
      accessRequests: this.store.accessRequests.list((a) => a.userId === userId),
    });
    return {
      source,
      project: { id: project.id, title: project.title, deadline: project.deadline },
      items: items.map((i) => {
        const e = i.equipmentId ? this.equipment(i.equipmentId) : undefined;
        return { ...i, equipmentName: e?.name, highDemand: e?.highDemand ?? false, label: i.start && i.end ? this.label({ start: i.start, end: i.end }) : undefined };
      }),
    };
  }

  // ---- fault reports -----------------------------------------------------------------

  reportFault(userId: string, equipmentId: string, description: string): FaultReport {
    this.equipment(equipmentId);
    const duplicate = this.store.faultReports.list((f) => f.equipmentId === equipmentId && f.reportedBy === userId && f.status === 'open');
    if (duplicate.length) throw new HttpError(409, 'DUPLICATE_REPORT', 'You already reported a fault on this equipment');
    return this.store.faultReports.insert({ equipmentId, reportedBy: userId, description, status: 'open', createdAt: toIso(this.clock()) });
  }

  openFaults(facultyId: string) {
    return this.store.faultReports
      .list((f) => f.status === 'open' && this.inScope(facultyId, f.equipmentId))
      .map((f) => ({ ...f, equipmentName: this.equipment(f.equipmentId).name, equipmentStatus: this.equipment(f.equipmentId).status, reporterName: this.user(f.reportedBy).name }));
  }

  /** Faculty either take the item offline for maintenance, or resolve the fault and bring it back online. */
  handleFault(facultyId: string, faultId: string, action: 'maintenance' | 'resolve') {
    const fault = this.store.faultReports.get(faultId);
    if (!fault || !this.inScope(facultyId, fault.equipmentId)) throw notFound('Fault report');
    if (fault.status !== 'open') throw new HttpError(409, 'ALREADY_RESOLVED', 'Fault was already resolved');
    if (action === 'maintenance') {
      this.store.equipment.update(fault.equipmentId, { status: 'maintenance' });
      return fault;
    }
    this.store.equipment.update(fault.equipmentId, { status: 'available' });
    return this.store.faultReports.update(faultId, { status: 'resolved', resolvedBy: facultyId });
  }

  // ---- at-a-glance counts ------------------------------------------------------------

  /** Counts shown as navigation badges so users see what needs attention. */
  summary(userId: string) {
    const user = this.user(userId);
    if (user.role === 'faculty') {
      return {
        approvals: this.store.accessRequests.list((a) => a.status === 'pending' && this.inScope(userId, a.equipmentId)).length,
        conflicts: this.conflicts(userId).filter((g) => g.requestIds.length > 1).length,
        faults: this.store.faultReports.list((f) => f.status === 'open' && this.inScope(userId, f.equipmentId)).length,
      };
    }
    this.releaseNoShows();
    const now = this.clock();
    return {
      upcoming: this.store.bookings.list((b) => b.userId === userId && b.status === 'confirmed' && Date.parse(b.end) > now).length,
      queued: this.store.slotRequests.list((r) => r.userId === userId && r.status === 'pending').length,
      awaitingApproval: this.store.accessRequests.list((a) => a.userId === userId && a.status === 'pending').length,
    };
  }

  // ---- analytics -----------------------------------------------------------------

  utilisation() {
    const now = this.clock();
    return utilisationReport({ start: now - 7 * DAY_MS, end: now }, this.store.equipment.list(), this.store.bookings.list(), this.store.departments.list());
  }
}
