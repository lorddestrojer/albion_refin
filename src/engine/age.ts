/**
 * Parse a timestamp from the Albion Data API. Timestamps come without a timezone
 * (e.g. "2026-11-21T18:00:00") and are UTC. "0001-01-01..." means "never seen".
 */
export function parseApiDate(date: string | null | undefined): number | null {
  if (!date || date.startsWith('0001-')) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(date);
  const ms = Date.parse(hasZone ? date : `${date}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Age of a timestamp in ms relative to `now`, or null when unknown. Never negative. */
export function ageMs(date: string | null | undefined, now: number): number | null {
  const ms = parseApiDate(date);
  return ms === null ? null : Math.max(0, now - ms);
}
