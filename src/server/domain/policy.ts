import { DAY_MS, durationHours, hoursWithin, isWithinLabHours, toInterval } from './time.js';
import type { AccessRequest, Booking, Equipment, Interval, Project, User } from './types.js';

/** Fair-use cap on confirmed lab hours per student in a rolling ±7-day window. */
export const WEEKLY_HOUR_CAP = 12;

export const VIOLATION_MESSAGES = {
  EQUIPMENT_UNAVAILABLE: 'Equipment is under maintenance.',
  OUTSIDE_LAB_HOURS: 'Slot must be whole hours between 09:00 and 18:00 on one day.',
  INVALID_DURATION: 'Slot is longer than this equipment allows.',
  IN_PAST: 'Slot starts in the past.',
  AFTER_DEADLINE: 'Slot ends after the project deadline.',
  NOT_PROJECT_OWNER: 'You can only book for your own project.',
  TRAINING_REQUIRED: 'Required safety training has not been completed.',
  APPROVAL_REQUIRED: 'Faculty approval is required for this equipment.',
  WEEKLY_CAP: `Booking would exceed the fair-use cap of ${WEEKLY_HOUR_CAP} hours per week.`,
} as const;

export type Violation = keyof typeof VIOLATION_MESSAGES;

export interface FeasibilityContext {
  now: number;
  user: User;
  project: Project;
  equipment: Equipment;
  /** The user's confirmed bookings (any equipment). */
  userBookings: Booking[];
  /** The user's access requests. */
  accessRequests: AccessRequest[];
}

/** Hours the user has booked in the rolling window around `now` — the fairness signal. */
export function recentUsageHours(userBookings: Booking[], now: number): number {
  const window = { start: now - 7 * DAY_MS, end: now + 7 * DAY_MS };
  const confirmed = userBookings.filter((b) => b.status === 'confirmed').map(toInterval);
  return hoursWithin(confirmed, window);
}

export function hasApprovedAccess(requests: AccessRequest[], equipmentId: string, projectId: string): boolean {
  return requests.some(
    (r) => r.equipmentId === equipmentId && r.projectId === projectId && r.status === 'approved',
  );
}

/**
 * Hard rules a slot must satisfy before it can be allocated. Returns every violation so
 * the user sees all problems at once rather than fixing them one by one.
 */
export function checkFeasibility(slot: Interval, ctx: FeasibilityContext): Violation[] {
  const { now, user, project, equipment, userBookings, accessRequests } = ctx;
  const violations: Violation[] = [];

  if (equipment.status !== 'available') violations.push('EQUIPMENT_UNAVAILABLE');
  if (!isWithinLabHours(slot)) violations.push('OUTSIDE_LAB_HOURS');
  if (durationHours(slot) > equipment.maxSlotHours) violations.push('INVALID_DURATION');
  if (slot.start < now) violations.push('IN_PAST');
  if (slot.end > Date.parse(project.deadline)) violations.push('AFTER_DEADLINE');
  if (project.ownerId !== user.id) violations.push('NOT_PROJECT_OWNER');
  if (equipment.requiredTraining && !user.trainings.includes(equipment.requiredTraining)) {
    violations.push('TRAINING_REQUIRED');
  }
  if (equipment.requiresApproval && !hasApprovedAccess(accessRequests, equipment.id, project.id)) {
    violations.push('APPROVAL_REQUIRED');
  }
  if (recentUsageHours(userBookings, now) + durationHours(slot) > WEEKLY_HOUR_CAP) {
    violations.push('WEEKLY_CAP');
  }
  return violations;
}

export function describeViolations(violations: Violation[]): string[] {
  return violations.map((v) => VIOLATION_MESSAGES[v]);
}
