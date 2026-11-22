const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Whole silver amount with thousands separators; "–" for missing values. */
export function fmtSilver(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return intFmt.format(Math.round(n));
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return `${fmtNum(n, digits)} %`;
}

/** Compact age such as "12 min", "3 h", "2 d"; "unknown" when null. */
export function fmtAge(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'unknown';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export type AgeLevel = 'fresh' | 'aging' | 'old' | 'unknown';

/** Colour class of a price age: up to 1 h fresh, up to 6 h aging, older is old. */
export function ageLevel(ms: number | null | undefined): AgeLevel {
  if (ms === null || ms === undefined) return 'unknown';
  if (ms <= 60 * 60_000) return 'fresh';
  if (ms <= 6 * 60 * 60_000) return 'aging';
  return 'old';
}
