import { toInterval } from './time.js';
import type { Booking } from './types.js';

/** Students may check in from 10 minutes before the start until 15 minutes after. */
export const CHECK_IN_OPENS_MS = 10 * 60 * 1000;
export const NO_SHOW_GRACE_MS = 15 * 60 * 1000;

export function canCheckIn(booking: Booking, now: number): boolean {
  const { start } = toInterval(booking);
  return (
    booking.status === 'confirmed' &&
    !booking.checkedInAt &&
    now >= start - CHECK_IN_OPENS_MS &&
    now <= start + NO_SHOW_GRACE_MS
  );
}

/**
 * Bookings whose holder missed the check-in window while the slot is still running.
 * Releasing them frees the rest of the slot for students in the queue (better utilisation).
 */
export function findNoShows(bookings: Booking[], now: number): Booking[] {
  return bookings.filter((b) => {
    if (b.status !== 'confirmed' || b.checkedInAt) return false;
    const { start, end } = toInterval(b);
    return now > start + NO_SHOW_GRACE_MS && now < end;
  });
}
