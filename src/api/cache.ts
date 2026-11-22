import { get, set } from 'idb-keyval';
import type { PriceBook } from '@/engine/types';

export interface CacheEntry {
  fetchedAt: number;
  book: PriceBook;
}

export interface Storage {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry): Promise<void>;
}

/** IndexedDB storage; any failure (private mode, blocked storage) falls back to memory. */
export function createDefaultStorage(): Storage {
  const memory = new Map<string, CacheEntry>();
  return {
    async get(key) {
      try {
        const v = (await get(key)) as CacheEntry | undefined;
        return v ?? memory.get(key);
      } catch {
        return memory.get(key);
      }
    },
    async set(key, value) {
      memory.set(key, value);
      try {
        await set(key, value);
      } catch {
        /* memory copy is enough */
      }
    },
  };
}

export class MarketCache {
  constructor(private readonly storage: Storage = createDefaultStorage()) {}

  static key(server: string, resource: string): string {
    return `market:${server}:${resource}`;
  }

  /** Entry regardless of age (used as a fallback when the network fails). */
  async peek(key: string): Promise<CacheEntry | undefined> {
    return this.storage.get(key);
  }

  /** Entry only when younger than `ttlMs`. */
  async getFresh(key: string, ttlMs: number, now: number): Promise<CacheEntry | undefined> {
    const entry = await this.storage.get(key);
    return entry && now - entry.fetchedAt < ttlMs ? entry : undefined;
  }

  async put(key: string, book: PriceBook, now: number): Promise<CacheEntry> {
    const entry = { fetchedAt: now, book };
    await this.storage.set(key, entry);
    return entry;
  }
}

export function createMemoryStorage(): Storage {
  const m = new Map<string, CacheEntry>();
  return {
    async get(k) {
      return m.get(k);
    },
    async set(k, v) {
      m.set(k, v);
    },
  };
}
