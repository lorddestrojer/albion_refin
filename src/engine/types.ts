import type { City, Recipe } from '@/data/types';

/** Price of one item in one city. `price` 0 or missing means "no data". */
export interface PricePoint {
  /** Lowest sell order (sell_price_min). */
  price: number;
  /** ISO timestamp of the observation, or null when unknown. */
  date: string | null;
}

/** itemId -> city -> price. */
export type PriceBook = Record<string, Partial<Record<City, PricePoint>>>;

export interface CalcInput {
  /** Number of purchase sets (one set = rawQty raw + 1 lower refined, i.e. inputs of one craft). */
  sets: number;
  rawQty: number;
  rawPrice: number;
  /** Lower-tier refined ingredients per craft: 1 normally, 0 for T2. */
  lowerQty: number;
  /** Price of the lower-tier refined ingredient (ignored when lowerQty is 0). */
  lowerPrice: number;
  /** Price the output is listed at (lowest sell order minus 1). */
  sellPrice: number;
  /** Resource return rate used for the calculation, 0 to <1. */
  rrr: number;
  /** Market tax rate, e.g. 0.04. */
  taxRate: number;
  /** Sell order setup fee rate, e.g. 0.025. */
  setupRate: number;
  /** Station fee per craft in silver. */
  feePerCraft: number;
  /** Focus per craft when Focus is used, otherwise null. */
  focusPerCraft: number | null;
  /** RRR without Focus, used for marginal SPF when Focus is used. */
  rrrNoFocus?: number;
}

export interface CalcResult {
  rawUnits: number;
  lowerUnits: number;
  rawCost: number;
  lowerCost: number;
  /** Expected number of crafts (= expected number of output items). */
  crafts: number;
  /** Output items you can count on (floor of crafts). */
  outputFloor: number;
  revenue: number;
  buyCost: number;
  stationCost: number;
  invested: number;
  netProfit: number;
  /** Percent, null when nothing was invested. */
  roi: number | null;
  focusTotal: number | null;
  /** Net profit per Focus spent, null without Focus. */
  spf: number | null;
  /** Extra profit from Focus per Focus spent, compared with the same run without Focus. */
  marginalSpf: number | null;
  /** Listing price at which net profit is exactly zero. */
  breakEvenSell: number | null;
}

export interface Leg {
  city: City;
  price: number;
  date: string | null;
}

export interface Route {
  rawCity: City;
  /** null for T2 (no lower refined ingredient). */
  lowerCity: City | null;
  refineCity: City;
  sellCity: City;
}

export interface Opportunity {
  recipe: Recipe;
  route: Route;
  rawPrice: number;
  lowerPrice: number;
  /** Listing price (lowest sell order in sell city minus 1). */
  sellPrice: number;
  sets: number;
  result: CalcResult;
  /** Age of the oldest price used, in ms; null when a date is unknown. */
  oldestAgeMs: number | null;
  /** Cheapest alternatives per leg, best first (includes the chosen one). */
  alternatives: { raw: Leg[]; lower: Leg[]; sell: Leg[] };
}
