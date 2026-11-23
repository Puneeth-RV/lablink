/** Text helpers for the deterministic (no-LLM) assistant. */

const STOP_WORDS = new Set([
  'i',
  'a',
  'an',
  'the',
  'to',
  'for',
  'my',
  'of',
  'and',
  'in',
  'on',
  'need',
  'want',
  'with',
  'some',
  'do',
  'is',
  'it',
  'me',
  'that',
  'project',
]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Deterministic deadline extraction for the fallback path: ISO dates, "5 December" /
 * "December 5", and "in N days|weeks". Returns YYYY-MM-DD or null.
 */
export function parseDeadline(text: string, today: string): string | null {
  const base = new Date(`${today}T00:00:00Z`);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const rel = text.match(/\bin\s+(\d{1,2})\s+(day|week)s?\b/);
  if (rel) return fmt(new Date(base.getTime() + Number(rel[1]) * (rel[2] === 'week' ? 7 : 1) * 86_400_000));
  const dm = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})/) ?? null;
  const md = text.match(/\b([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?\b/) ?? null;
  for (const [day, month] of [dm ? [dm[1], dm[2]] : null, md ? [md[2], md[1]] : null].filter(Boolean) as [
    string,
    string,
  ][]) {
    const m = MONTHS.indexOf(month.slice(0, 3));
    if (m < 0) continue;
    let d = new Date(Date.UTC(base.getUTCFullYear(), m, Number(day)));
    if (d < base) d = new Date(Date.UTC(base.getUTCFullYear() + 1, m, Number(day)));
    return fmt(d);
  }
  return null;
}
