// Calendar-date helpers in LOCAL time (dependency-free, client-safe).
//
// Using date.toISOString() on a local-midnight Date rolls the day BACK in UTC+
// timezones — e.g. in Sydney (UTC+10), picking the 19th yields a local-midnight
// Date that toISOString()s to '2026-06-18T14:00Z', so '...split("T")[0]' gives
// '2026-06-18'. For date-only fields (phase/task/POV start/end/due dates) use
// these to keep the picked Y-M-D stable in any timezone.

/** Format a Date as 'YYYY-MM-DD' using its LOCAL calendar day (no UTC shift). */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse a date-only value to a LOCAL-midnight Date by its calendar day.
 * Accepts 'YYYY-MM-DD', a full ISO string, or a Date (read via its UTC date part,
 * since date-only fields are stored at UTC midnight). The result renders as the
 * intended calendar day in ANY timezone — use it to wrap displays
 * (`fromLocalYmd(x).toLocaleDateString()`, `format(fromLocalYmd(x), ...)`) and
 * DatePicker `value`.
 */
export function fromLocalYmd(value: string | Date): Date {
  const s = typeof value === 'string' ? value : value.toISOString();
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
