import type { MarketState } from '@/api/useMarket';
import { fmtAge } from './format';
import { useNow } from './useNow';

/** Status line for the market data of the current view: loading, source, offline and throttle warnings. */
export default function DataBanner({ market }: { market: MarketState }) {
  const { loading, result, error, refresh } = market;
  const now = useNow();

  let tone = 'border-border bg-panel text-muted';
  let text = '';

  if (error) {
    tone = 'border-bad/40 bg-bad/10 text-bad';
    text = `Could not load prices: ${error}`;
  } else if (loading) {
    text = 'Loading prices from the Albion Data Project…';
  } else if (result) {
    const age = fmtAge(Math.max(0, now - result.fetchedAt));
    const w = result.warning;
    if (w?.kind === 'throttled') {
      tone = 'border-warn/40 bg-warn/10 text-warn';
      const until = w.resetAt ? ` Try again after ${new Date(w.resetAt).toLocaleTimeString()}.` : '';
      text = `The API is throttling requests.${until} Showing ${result.source === 'mock' ? 'offline mock data' : `cached data (${age} old)`}.`;
    } else if (w?.kind === 'offline' || result.source === 'mock') {
      tone = 'border-warn/40 bg-warn/10 text-warn';
      text =
        result.source === 'mock'
          ? 'Offline – mock data. These prices are made up and only show how the app works.'
          : `Offline – showing cached data (${age} old).`;
    } else {
      text = result.source === 'cache' ? `Cached prices, fetched ${age} ago.` : `Live prices, fetched ${age} ago.`;
    }
  }

  return (
    <div role="status" className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${tone}`}>
      <span>{text}</span>
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="shrink-0 rounded border border-border bg-panel-2 px-2 py-1 text-xs text-text hover:border-accent disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  );
}
