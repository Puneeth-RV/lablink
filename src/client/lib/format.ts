const TZ = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const time = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const date = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));
export const formatSlot = (s: { start: string; end: string }) => `${formatDateTime(s.start)}–${formatTime(s.end)}`;
export const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/** YYYY-MM-DD of the campus day `offsetDays` from now. */
export function campusDate(offsetDays = 0): string {
  return isoDate.format(new Date(Date.now() + offsetDays * 86_400_000));
}

/** ISO timestamp for `hour`:00 campus time on `day` (YYYY-MM-DD). */
export function campusIso(day: string, hour: number): string {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();
}

export const daysUntil = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);

export const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const hourOnly = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });

/** Campus-local day (YYYY-MM-DD) and hour of an ISO timestamp. */
export function campusParts(iso: string): { day: string; hour: number } {
  const d = new Date(iso);
  return { day: isoDate.format(d), hour: Number(hourOnly.format(d)) };
}
