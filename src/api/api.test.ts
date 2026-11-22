import { describe, expect, it, vi } from 'vitest';
import { CITIES } from '@/data/cities';
import { itemIdsFor } from '@/data/recipes';
import { MarketCache, createMemoryStorage } from './cache';
import {
  HOSTS,
  MAX_URL_LENGTH,
  RequestQueue,
  ThrottleError,
  buildUrls,
  fetchPrices,
  fetchRows,
  parseThrottleReset,
} from './client';
import { loadMarket } from './market';
import { mockPriceBook } from './mock';
import { parsePrices } from './parse';

const NOW = Date.parse('2026-11-21T18:30:00Z');

function response(body: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as unknown as Response;
}

const row = (item_id: string, city: string, price: number, date = '2026-11-21T18:00:00') => ({
  item_id,
  city,
  quality: 1,
  sell_price_min: price,
  sell_price_min_date: date,
});

describe('buildUrls', () => {
  it('uses the right host per server and stays within the URL limit', () => {
    for (const server of ['europe', 'americas', 'asia'] as const) {
      const urls = buildUrls(server, itemIdsFor('wood'));
      expect(urls.length).toBeGreaterThanOrEqual(1);
      for (const u of urls) {
        expect(u.startsWith(`https://${HOSTS[server]}/api/v2/stats/prices/`)).toBe(true);
        expect(u.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
      }
    }
  });
  it('splits into several requests when the limit is small and covers every id once', () => {
    const ids = itemIdsFor('hide');
    const urls = buildUrls('europe', ids, CITIES, 400);
    expect(urls.length).toBeGreaterThan(1);
    const seen = urls.flatMap((u) => u.split('/prices/')[1].split('.json')[0].split(','));
    expect(seen.sort()).toEqual([...ids].sort());
    for (const u of urls) expect(u.length).toBeLessThanOrEqual(400);
  });
  it('requests all six safe cities and never Caerleon', () => {
    const [url] = buildUrls('europe', ['T4_WOOD']);
    expect(decodeURIComponent(url)).toContain('Fort Sterling');
    expect(decodeURIComponent(url)).toContain('Brecilien');
    expect(url.toLowerCase()).not.toContain('caerleon');
  });
});

describe('throttle detection', () => {
  const text = 'Throttled, be nice to the server, use compression (gzip, deflate, etc)! Throttle resets at 2026-11-21 18:40:00 +0000!';
  it('parses the reset time', () => {
    expect(parseThrottleReset(text)).toBe(Date.parse('2026-11-21T18:40:00Z'));
    expect(parseThrottleReset('nothing')).toBeNull();
  });
  it('fetchRows throws ThrottleError for the plain text reply', async () => {
    const fetchImpl = vi.fn(async () => response(text));
    const err = await fetchRows('https://x', { fetchImpl, queue: new RequestQueue(0) }).catch((e) => e);
    expect(err).toBeInstanceOf(ThrottleError);
    expect((err as ThrottleError).resetAt).toBe(Date.parse('2026-11-21T18:40:00Z'));
  });
  it('fetchRows rejects HTTP errors and non-array JSON', async () => {
    const q = new RequestQueue(0);
    await expect(fetchRows('https://x', { fetchImpl: async () => response('oops', false, 500), queue: q })).rejects.toThrow(/HTTP 500/);
    await expect(fetchRows('https://x', { fetchImpl: async () => response('{"a":1}'), queue: q })).rejects.toThrow(/unexpected/);
    await expect(fetchRows('https://x', { fetchImpl: async () => response('<html>'), queue: q })).rejects.toThrow(/unreadable/);
  });
});

describe('RequestQueue', () => {
  it('runs tasks sequentially in order and keeps going after a failure', async () => {
    const q = new RequestQueue(0);
    const order: number[] = [];
    const a = q.schedule(async () => {
      await new Promise((r) => setTimeout(r, 15));
      order.push(1);
    });
    const b = q.schedule(async () => {
      order.push(2);
      throw new Error('boom');
    });
    const c = q.schedule(async () => {
      order.push(3);
    });
    await a;
    await expect(b).rejects.toThrow('boom');
    await c;
    expect(order).toEqual([1, 2, 3]);
  });
  it('does not start tasks after abort', async () => {
    const q = new RequestQueue(0);
    const ctrl = new AbortController();
    ctrl.abort();
    const task = vi.fn(async () => 1);
    await expect(q.schedule(task, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).not.toHaveBeenCalled();
  });
});

describe('parsePrices', () => {
  it('drops zero prices, unknown cities and bad dates; keeps the lowest positive price', () => {
    const book = parsePrices([
      row('T4_WOOD', 'Martlock', 0),
      row('T4_WOOD', 'Caerleon', 50),
      row('T4_WOOD', 'Black Market', 50),
      row('T4_WOOD', 'Thetford', 90, '0001-01-01T00:00:00'),
      row('T4_WOOD', 'Lymhurst', 120),
      row('T4_WOOD', 'Lymhurst', 100),
      row('T4_PLANKS', 'Fort Sterling', 300),
    ]);
    expect(book.T4_WOOD).toEqual({ Lymhurst: { price: 100, date: '2026-11-21T18:00:00' } });
    expect(book.T4_PLANKS['Fort Sterling']?.price).toBe(300);
    expect(JSON.stringify(book)).not.toMatch(/caerleon/i);
  });
});

describe('MarketCache', () => {
  it('returns entries only while fresh', async () => {
    const cache = new MarketCache(createMemoryStorage());
    const key = MarketCache.key('europe', 'wood');
    await cache.put(key, { T4_WOOD: {} }, 1000);
    expect(await cache.getFresh(key, 5000, 3000)).toBeDefined();
    expect(await cache.getFresh(key, 5000, 6001)).toBeUndefined();
    expect(await cache.peek(key)).toBeDefined();
  });
});

describe('loadMarket', () => {
  const rows = (id: string) => [row(id, 'Martlock', 80)];
  const okFetch = () => vi.fn(async (url: RequestInfo | URL) => response(JSON.stringify(rows(String(url).includes('west') ? 'WEST' : 'T4_WOOD'))));

  it('fetches live, then serves from cache, and a server change fetches again', async () => {
    const cache = new MarketCache(createMemoryStorage());
    const fetchImpl = okFetch();
    const base = { cache, fetchImpl: fetchImpl as unknown as typeof fetch, queue: new RequestQueue(0), now: () => NOW };

    const first = await loadMarket('europe', 'wood', base);
    expect(first.source).toBe('live');
    const callsAfterFirst = fetchImpl.mock.calls.length;

    const second = await loadMarket('europe', 'wood', base);
    expect(second.source).toBe('cache');
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);

    const other = await loadMarket('americas', 'wood', base);
    expect(other.source).toBe('live');
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toContain('west.albion-online-data.com');
  });

  it('force skips the fresh cache', async () => {
    const cache = new MarketCache(createMemoryStorage());
    const fetchImpl = okFetch();
    const base = { cache, fetchImpl: fetchImpl as unknown as typeof fetch, queue: new RequestQueue(0), now: () => NOW };
    await loadMarket('europe', 'ore', base);
    const n = fetchImpl.mock.calls.length;
    await loadMarket('europe', 'ore', { ...base, force: true });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(n);
  });

  it('falls back to mock data with an offline warning when the network fails', async () => {
    const result = await loadMarket('europe', 'wood', {
      cache: new MarketCache(createMemoryStorage()),
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
      queue: new RequestQueue(0),
      now: () => NOW,
    });
    expect(result.source).toBe('mock');
    expect(result.warning?.kind).toBe('offline');
    expect(Object.keys(result.book).length).toBeGreaterThan(10);
  });

  it('uses stale cache instead of mock when throttled', async () => {
    const cache = new MarketCache(createMemoryStorage());
    await cache.put(MarketCache.key('europe', 'wood'), { T4_WOOD: { Martlock: { price: 77, date: '2026-11-21T10:00:00' } } }, NOW - 60 * 60 * 1000);
    const result = await loadMarket('europe', 'wood', {
      cache,
      fetchImpl: (async () => response('Throttled, be nice. Throttle resets at 2026-11-21 18:40:00 +0000!')) as unknown as typeof fetch,
      queue: new RequestQueue(0),
      now: () => NOW,
    });
    expect(result.source).toBe('cache');
    expect(result.warning).toMatchObject({ kind: 'throttled', resetAt: Date.parse('2026-11-21T18:40:00Z') });
    expect(result.book.T4_WOOD.Martlock?.price).toBe(77);
  });

  it('re-throws aborts', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      loadMarket('europe', 'wood', {
        cache: new MarketCache(createMemoryStorage()),
        fetchImpl: okFetch() as unknown as typeof fetch,
        queue: new RequestQueue(0),
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('fetchPrices', () => {
  it('requests every batch and merges the rows', async () => {
    const fetchImpl = vi.fn(async () => response(JSON.stringify([row('T4_WOOD', 'Martlock', 80)])));
    const book = await fetchPrices('europe', 'wood', { fetchImpl: fetchImpl as unknown as typeof fetch, queue: new RequestQueue(0) });
    expect(book.T4_WOOD.Martlock?.price).toBe(80);
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('mock data', () => {
  it('is deterministic, covers every item in every safe city and has plausible dates', () => {
    const a = mockPriceBook('hide', NOW);
    const b = mockPriceBook('hide', NOW);
    expect(a).toEqual(b);
    for (const id of itemIdsFor('hide')) {
      for (const city of CITIES) {
        const p = a[id]?.[city];
        expect(p, `${id} ${city}`).toBeDefined();
        expect(p!.price).toBeGreaterThan(0);
        expect(Date.parse(`${p!.date}Z`)).toBeLessThanOrEqual(NOW);
      }
    }
  });
});
