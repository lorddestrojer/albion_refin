import { CITIES } from '@/data/cities';
import { itemIdsFor } from '@/data/recipes';
import type { City, Resource, Server } from '@/data/types';
import type { PriceBook } from '@/engine/types';
import { parsePrices } from './parse';

export const HOSTS: Record<Server, string> = {
  europe: 'europe.albion-online-data.com',
  americas: 'west.albion-online-data.com',
  asia: 'east.albion-online-data.com',
};

/** The API rejects URLs over 4096 characters; stay safely below. */
export const MAX_URL_LENGTH = 3800;

/** Raw row of /api/v2/stats/prices (only fields we use). */
export interface ApiPriceRow {
  item_id: string;
  city: string;
  quality?: number;
  sell_price_min: number;
  sell_price_min_date: string;
}

export class ThrottleError extends Error {
  constructor(
    message: string,
    /** When the throttle resets (epoch ms), if the API said so. */
    public readonly resetAt: number | null,
  ) {
    super(message);
    this.name = 'ThrottleError';
  }
}

export function parseThrottleReset(text: string): number | null {
  const m = /resets at (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})/.exec(text);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  return Number.isNaN(ms) ? null : ms;
}

function urlFor(server: Server, ids: string[], locations: readonly City[]): string {
  const loc = locations.map(encodeURIComponent).join(',');
  return `https://${HOSTS[server]}/api/v2/stats/prices/${ids.join(',')}.json?locations=${loc}`;
}

/** Split item IDs into as few requests as possible, each URL within the length limit. */
export function buildUrls(
  server: Server,
  itemIds: string[],
  locations: readonly City[] = CITIES,
  maxLength: number = MAX_URL_LENGTH,
): string[] {
  const urls: string[] = [];
  let batch: string[] = [];
  for (const id of itemIds) {
    const next = [...batch, id];
    if (batch.length > 0 && urlFor(server, next, locations).length > maxLength) {
      urls.push(urlFor(server, batch, locations));
      batch = [id];
    } else {
      batch = next;
    }
  }
  if (batch.length > 0) urls.push(urlFor(server, batch, locations));
  return urls;
}

/** Runs tasks one at a time with a minimum gap, keeping us far below 180 requests per minute. */
export class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(private readonly minIntervalMs: number = 400) {}

  schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const run = async (): Promise<T> => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      this.last = Date.now();
      return task();
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  queue?: RequestQueue;
  signal?: AbortSignal;
}

const sharedQueue = new RequestQueue();

export async function fetchRows(url: string, deps: FetchDeps = {}): Promise<ApiPriceRow[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const queue = deps.queue ?? sharedQueue;
  return queue.schedule(async () => {
    const res = await fetchImpl(url, { signal: deps.signal });
    const text = await res.text();
    if (/^\s*Throttled/i.test(text)) {
      throw new ThrottleError('Albion Data API is throttling requests', parseThrottleReset(text));
    }
    if (!res.ok) throw new Error(`Albion Data API error: HTTP ${res.status}`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Albion Data API returned an unreadable response');
    }
    if (!Array.isArray(json)) throw new Error('Albion Data API returned an unexpected response');
    return json as ApiPriceRow[];
  }, deps.signal);
}

/** Download prices of every item of one resource type in all safe cities. */
export async function fetchPrices(server: Server, resource: Resource, deps: FetchDeps = {}): Promise<PriceBook> {
  const urls = buildUrls(server, itemIdsFor(resource));
  const rows: ApiPriceRow[] = [];
  for (const url of urls) rows.push(...(await fetchRows(url, deps)));
  return parsePrices(rows);
}
