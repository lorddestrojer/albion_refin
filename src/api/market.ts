import type { Resource, Server } from '@/data/types';
import type { PriceBook } from '@/engine/types';
import { MarketCache } from './cache';
import { type FetchDeps, ThrottleError, fetchPrices } from './client';
import { mockPriceBook } from './mock';

export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type MarketSource = 'live' | 'cache' | 'mock';

export interface MarketWarning {
  kind: 'offline' | 'throttled';
  message: string;
  /** Epoch ms when the throttle resets, if known. */
  resetAt: number | null;
}

export interface MarketResult {
  book: PriceBook;
  /** When the data was fetched (epoch ms); `now` for mock data. */
  fetchedAt: number;
  source: MarketSource;
  warning: MarketWarning | null;
}

export interface LoadOptions extends FetchDeps {
  cache?: MarketCache;
  ttlMs?: number;
  /** Skip the fresh-cache shortcut and hit the API. */
  force?: boolean;
  now?: () => number;
}

/**
 * Load prices for one server and resource type:
 * fresh cache -> live API -> stale cache -> mock data. Aborts are re-thrown.
 */
export async function loadMarket(server: Server, resource: Resource, opts: LoadOptions = {}): Promise<MarketResult> {
  const cache = opts.cache ?? new MarketCache();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now;
  const key = MarketCache.key(server, resource);

  if (!opts.force) {
    const fresh = await cache.getFresh(key, ttl, now());
    if (fresh) return { book: fresh.book, fetchedAt: fresh.fetchedAt, source: 'cache', warning: null };
  }

  try {
    const book = await fetchPrices(server, resource, opts);
    const entry = await cache.put(key, book, now());
    return { book: entry.book, fetchedAt: entry.fetchedAt, source: 'live', warning: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if (opts.signal?.aborted) throw err;

    const warning: MarketWarning =
      err instanceof ThrottleError
        ? { kind: 'throttled', message: err.message, resetAt: err.resetAt }
        : { kind: 'offline', message: err instanceof Error ? err.message : 'Network error', resetAt: null };

    const stale = await cache.peek(key);
    if (stale) return { book: stale.book, fetchedAt: stale.fetchedAt, source: 'cache', warning };
    const t = now();
    return { book: mockPriceBook(resource, t), fetchedAt: t, source: 'mock', warning };
  }
}
