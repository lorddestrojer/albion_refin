import { BONUS_CITY, CITIES } from '@/data/cities';
import { recipesFor } from '@/data/recipes';
import type { Resource } from '@/data/types';
import type { PriceBook } from '@/engine/types';

/** Small deterministic hash so mock data is stable between reloads. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '');
}

/**
 * Offline fallback prices for one resource. Not real market data:
 * raw prices grow with tier/enchant, refined prices are roughly input cost
 * plus a city-dependent margin, so a few routes look profitable.
 */
export function mockPriceBook(resource: Resource, now: number): PriceBook {
  const book: PriceBook = {};
  const put = (id: string, base: number, spread: number): void => {
    const byCity = (book[id] ??= {});
    for (const city of CITIES) {
      const h = hash(`${id}:${city}`);
      const price = Math.max(1, Math.round(base * (1 - spread + 2 * spread * h)));
      const ageMin = Math.floor(hash(`age:${id}:${city}`) * 600);
      byCity[city] = { price, date: iso(now - ageMin * 60_000) };
    }
  };
  const rawBase = (tier: number, e: number): number => 12 * 2.1 ** (tier - 2) * (1 + 0.45 * e);
  const refinedBase = new Map<string, number>();

  for (const r of recipesFor(resource)) {
    put(r.rawId, rawBase(r.tier, r.enchant), 0.2);
    const lowerCost = r.lowerRefinedId ? (refinedBase.get(r.lowerRefinedId) ?? 0) : 0;
    const value = (r.rawQty * rawBase(r.tier, r.enchant) + lowerCost) * 1.15;
    refinedBase.set(r.refinedId, value);
  }
  for (const r of recipesFor(resource)) {
    const value = refinedBase.get(r.refinedId) as number;
    put(r.refinedId, value, 0.25);
    // The bonus city tends to sell refined goods a bit cheaper.
    const city = BONUS_CITY[resource];
    const entry = book[r.refinedId][city];
    if (entry) entry.price = Math.max(1, Math.round(entry.price * 0.95));
  }
  return book;
}
