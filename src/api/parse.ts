import { CITIES } from '@/data/cities';
import type { City } from '@/data/types';
import { parseApiDate } from '@/engine/age';
import type { PriceBook } from '@/engine/types';

interface Row {
  item_id: string;
  city: string;
  sell_price_min: number;
  sell_price_min_date: string;
}

const CITY_SET = new Set<string>(CITIES);

/**
 * Convert API rows to a price book. Rows with price 0 (no data), unknown cities
 * (Caerleon, Black Market, ...) and rows with an unparseable date are dropped.
 * When several qualities report a price, the lowest positive one wins.
 */
export function parsePrices(rows: Row[]): PriceBook {
  const book: PriceBook = {};
  for (const row of rows) {
    if (!CITY_SET.has(row.city)) continue;
    const price = Number(row.sell_price_min);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (parseApiDate(row.sell_price_min_date) === null) continue;
    const city = row.city as City;
    const byCity = (book[row.item_id] ??= {});
    const existing = byCity[city];
    if (!existing || price < existing.price) {
      byCity[city] = { price, date: row.sell_price_min_date };
    }
  }
  return book;
}
