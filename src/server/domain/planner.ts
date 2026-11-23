import { isSlotFree } from './allocation.js';
import { checkFeasibility, describeViolations, recentUsageHours, WEEKLY_HOUR_CAP } from './policy.js';
import { candidateSlots, overlaps, toInterval, toIso } from './time.js';
import type {
  AccessRequest,
  Booking,
  Equipment,
  Interval,
  PlanItem,
  PlanNeed,
  Project,
  User,
} from './types.js';

export interface PlanContext {
  now: number;
  user: User;
  project: Project;
  equipment: Equipment[];
  bookings: Booking[];
  accessRequests: AccessRequest[];
}

/**
 * Turns inferred equipment needs into a concrete, feasible schedule before the project deadline.
 * For each need it picks the earliest slot on any suitable item that passes every hard rule,
 * never overlaps the student's other bookings or earlier plan items, and respects the weekly cap.
 */
export function planSchedule(needs: PlanNeed[], ctx: PlanContext): PlanItem[] {
  const { now, user, project, equipment, bookings, accessRequests } = ctx;
  const deadline = Date.parse(project.deadline);
  const userBookings = bookings.filter((b) => b.userId === user.id);
  const busy: Interval[] = userBookings.filter((b) => b.status === 'confirmed').map(toInterval);
  let plannedHours = recentUsageHours(userBookings, now);

  return needs.map((need) => {
    const candidates = equipment.filter((e) => e.category === need.category);
    if (!candidates.length) return { ...need, issues: ['No equipment of this type is available on campus.'] };

    const hours = Math.min(need.hours, Math.max(...candidates.map((e) => e.maxSlotHours)));
    if (plannedHours + hours > WEEKLY_HOUR_CAP) {
      return {
        ...need,
        hours,
        issues: [`Would exceed the fair-use cap of ${WEEKLY_HOUR_CAP} hours per week.`],
      };
    }

    const blockers = new Set<string>();
    let best: { equipment: Equipment; slot: Interval } | undefined;
    for (const e of candidates) {
      const h = Math.min(hours, e.maxSlotHours);
      for (const slot of candidateSlots(now, deadline, h)) {
        if (best && slot.start >= best.slot.start) break;
        if (busy.some((b) => overlaps(b, slot)) || !isSlotFree(e.id, slot, bookings)) continue;
        const violations = checkFeasibility(slot, {
          now,
          user,
          project,
          equipment: e,
          userBookings,
          accessRequests,
        }).filter((v) => v !== 'WEEKLY_CAP');
        if (violations.length) {
          describeViolations(violations).forEach((v) => blockers.add(`${e.name}: ${v}`));
          break; // rule violations are not time-dependent for this item
        }
        best = { equipment: e, slot };
        break;
      }
    }

    if (!best) {
      return {
        ...need,
        hours,
        issues: blockers.size ? [...blockers] : ['No free slot before the project deadline.'],
      };
    }
    busy.push(best.slot);
    plannedHours += (best.slot.end - best.slot.start) / 3_600_000;
    return {
      ...need,
      hours,
      equipmentId: best.equipment.id,
      start: toIso(best.slot.start),
      end: toIso(best.slot.end),
      issues: [],
    };
  });
}
