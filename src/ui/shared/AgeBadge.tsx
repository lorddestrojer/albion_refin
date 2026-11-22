import { type AgeLevel, ageLevel, fmtAge } from './format';

const STYLE: Record<AgeLevel, string> = {
  fresh: 'border-good/40 bg-good/10 text-good',
  aging: 'border-warn/40 bg-warn/10 text-warn',
  old: 'border-bad/40 bg-bad/10 text-bad',
  unknown: 'border-border bg-panel-2 text-muted',
};

/** Colour-coded age of a price. */
export default function AgeBadge({ ageMs, title }: { ageMs: number | null | undefined; title?: string }) {
  const level = ageLevel(ageMs);
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs tabular-nums ${STYLE[level]}`}
      title={title ?? 'Age of the price data'}
    >
      {fmtAge(ageMs)}
    </span>
  );
}
