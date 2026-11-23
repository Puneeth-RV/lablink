/** Minimal RFC 5545 calendar file for one booking, generated client-side (no extra API surface). */
export interface CalendarEvent {
  uid: string;
  title: string;
  location: string;
  description: string;
  start: string;
  end: string;
}

const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
/** Escape characters with special meaning in iCalendar text values. */
const text = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function toIcs(e: CalendarEvent, now: Date = new Date()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LabLink//Lab Booking//EN',
    'BEGIN:VEVENT',
    `UID:${e.uid}@lablink`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${text(e.title)}`,
    `LOCATION:${text(e.location)}`,
    `DESCRIPTION:${text(e.description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Lab booking starts in 15 minutes — remember to check in',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Triggers a download of the .ics file via a temporary object URL. */
export function downloadIcs(e: CalendarEvent): void {
  const url = URL.createObjectURL(new Blob([toIcs(e)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `lablink-${e.uid}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
