import type { Interval } from './types.js';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Labs operate 09:00–18:00 campus time (IST, UTC+05:30). */
export const LAB_OPEN_HOUR = 9;
export const LAB_CLOSE_HOUR = 18;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** True when two half-open intervals share any time. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function toInterval(slot: { start: string; end: string }): Interval {
  return { start: Date.parse(slot.start), end: Date.parse(slot.end) };
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Start of the campus (IST) day containing `ms`, as epoch ms. */
export function campusDayStart(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** Fractional campus-local hour of day for `ms`. */
export function campusHour(ms: number): number {
  return (ms - campusDayStart(ms)) / HOUR_MS;
}

/** Epoch ms for `hour`:00 campus time, `dayOffset` days after the day containing `ms`. */
export function campusTime(ms: number, dayOffset: number, hour: number): number {
  return campusDayStart(ms) + dayOffset * DAY_MS + hour * HOUR_MS;
}

/** Whole-hour slot that starts and ends within lab hours on a single day. */
export function isWithinLabHours({ start, end }: Interval): boolean {
  if (end <= start) return false;
  if (campusDayStart(start) !== campusDayStart(end - 1)) return false;
  const startHour = campusHour(start);
  if (!Number.isInteger(startHour) || (end - start) % HOUR_MS !== 0) return false;
  return startHour >= LAB_OPEN_HOUR && startHour + durationHours({ start, end }) <= LAB_CLOSE_HOUR;
}

export function durationHours({ start, end }: Interval): number {
  return (end - start) / HOUR_MS;
}

/** Total hours of `intervals` that fall inside `window`. */
export function hoursWithin(intervals: Interval[], window: Interval): number {
  return intervals.reduce((sum, i) => {
    const s = Math.max(i.start, window.start);
    const e = Math.min(i.end, window.end);
    return e > s ? sum + (e - s) / HOUR_MS : sum;
  }, 0);
}

/**
 * Candidate slots of `hours` length, on the hour, inside lab hours, from `from` up to `until`.
 * Generated lazily so callers can stop early.
 */
export function* candidateSlots(from: number, until: number, hours: number): Generator<Interval> {
  const dayStart = campusDayStart(from);
  const firstHour = dayStart + Math.ceil((from - dayStart) / HOUR_MS) * HOUR_MS;
  for (let start = firstHour; start + hours * HOUR_MS <= until; start += HOUR_MS) {
    const slot = { start, end: start + hours * HOUR_MS };
    if (isWithinLabHours(slot)) yield slot;
  }
}
