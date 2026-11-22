import { BONUS_CITY, CITIES } from '@/data/cities';
import { RRR_BONUS_CITY, SETUP_FEE, marketTax } from '@/data/rates';
import type { City, Recipe } from '@/data/types';
import { ageMs } from './age';
import { calculate, unitCost } from './calc';
import { listingPrice, stationFeePerCraft } from './fees';
import { type SpecLevels, focusPerCraft } from './focusEfficiency';
import type { Leg, Opportunity, PriceBook } from './types';
import { marketRisks } from './warnings';

export interface WizardParams {
  /** Silver budget for purchasing inputs. */
  budget: number;
  focusMode: boolean;
  spec: SpecLevels;
  premium: boolean;
  /** Fee per 100 nutrition at the refining station. */
  fee100: number;
  /** Focus available (only used when focusMode is on). */
  focusPool: number;
  /** Current time in ms, used for price ages. */
  now: number;
  /** Optional manual RRR override (0-1). */
  rrrOverride?: number;
}

/** Number of alternatives kept per leg. */
const ALT_COUNT = 3;

/** Prices of an item across cities, only cities with data (price > 0), cheapest first. */
export function legsAscending(prices: PriceBook, itemId: string): Leg[] {
  const byCity = prices[itemId] ?? {};
  const legs: Leg[] = [];
  for (const city of CITIES) {
    const p = byCity[city];
    if (p && p.price > 0) legs.push({ city, price: p.price, date: p.date });
  }
  return legs.sort((a, b) => a.price - b.price);
}

function worstAge(dates: Array<string | null>, now: number): number | null {
  let worst = 0;
  for (const d of dates) {
    const a = ageMs(d, now);
    if (a === null) return null;
    worst = Math.max(worst, a);
  }
  return worst;
}

/**
 * Best route for one recipe: cheapest raw city, cheapest lower-refined city
 * (chosen independently), refining in the bonus city, best sell city.
 * Returns null when data is missing or the budget / Focus allows no craft.
 */
export function evaluateRecipe(recipe: Recipe, prices: PriceBook, params: WizardParams): Opportunity | null {
  const rawLegs = legsAscending(prices, recipe.rawId);
  const lowerLegs = recipe.lowerRefinedId ? legsAscending(prices, recipe.lowerRefinedId) : [];
  const sellLegs = legsAscending(prices, recipe.refinedId).reverse();
  if (rawLegs.length === 0 || sellLegs.length === 0) return null;
  if (recipe.lowerRefinedId && lowerLegs.length === 0) return null;

  const rawLeg = rawLegs[0];
  const lowerLeg = recipe.lowerRefinedId ? lowerLegs[0] : null;
  const sellLeg = sellLegs[0];
  const sellPrice = listingPrice(sellLeg.price);
  if (sellPrice <= 0) return null;

  const lowerQty = recipe.lowerRefinedId ? 1 : 0;
  const rawPrice = rawLeg.price;
  const lowerPrice = lowerLeg ? lowerLeg.price : 0;
  const unit = unitCost({ rawQty: recipe.rawQty, rawPrice, lowerQty, lowerPrice });
  if (unit <= 0) return null;

  const rrrNoFocus = params.rrrOverride ?? RRR_BONUS_CITY.noFocus;
  const rrr = params.focusMode ? (params.rrrOverride ?? RRR_BONUS_CITY.focus) : rrrNoFocus;
  const focusPer = params.focusMode ? focusPerCraft(recipe.resource, recipe.tier, recipe.enchant, params.spec) : null;
  if (params.focusMode && focusPer === null) return null;

  let sets = Math.floor(params.budget / unit);
  if (focusPer !== null && focusPer > 0 && Number.isFinite(params.focusPool)) {
    const maxCrafts = Math.floor(params.focusPool / focusPer);
    const maxSets = Math.floor(maxCrafts * (1 - Math.min(0.99, rrr)));
    sets = Math.min(sets, maxSets);
  }
  if (sets <= 0) return null;

  const result = calculate({
    sets,
    rawQty: recipe.rawQty,
    rawPrice,
    lowerQty,
    lowerPrice,
    sellPrice,
    rrr,
    taxRate: marketTax(params.premium),
    setupRate: SETUP_FEE,
    feePerCraft: stationFeePerCraft(recipe.tier, recipe.enchant, params.fee100),
    focusPerCraft: focusPer,
    rrrNoFocus: params.focusMode ? rrrNoFocus : undefined,
  });

  const refineCity: City = BONUS_CITY[recipe.resource];
  const dates = [rawLeg.date, sellLeg.date, ...(lowerLeg ? [lowerLeg.date] : [])];

  return {
    recipe,
    route: { rawCity: rawLeg.city, lowerCity: lowerLeg ? lowerLeg.city : null, refineCity, sellCity: sellLeg.city },
    rawPrice,
    lowerPrice,
    sellPrice,
    sets,
    result,
    oldestAgeMs: worstAge(dates, params.now),
    alternatives: {
      raw: rawLegs.slice(0, ALT_COUNT),
      lower: lowerLegs.slice(0, ALT_COUNT),
      sell: sellLegs.slice(0, ALT_COUNT),
    },
  };
}

export function findOpportunities(recipes: Recipe[], prices: PriceBook, params: WizardParams): Opportunity[] {
  const out: Opportunity[] = [];
  for (const r of recipes) {
    const o = evaluateRecipe(r, prices, params);
    if (o) out.push(o);
  }
  return out;
}

export type SortKey = 'roi' | 'spf' | 'profit';

export interface WizardFilter {
  /** Minimum ROI in percent. */
  minRoi: number;
  /** Maximum age of the oldest price in ms; null = no limit. */
  maxAgeMs: number | null;
  /** Drop results with thin-market warnings (see warnings.ts). */
  hideRisky?: boolean;
}

export function filterOpportunities(opps: Opportunity[], filter: WizardFilter): Opportunity[] {
  return opps.filter((o) => {
    if ((o.result.roi ?? -Infinity) < filter.minRoi) return false;
    if (filter.hideRisky && marketRisks(o).length > 0) return false;
    if (filter.maxAgeMs !== null) {
      // Unknown age cannot be shown to satisfy the limit.
      if (o.oldestAgeMs === null || o.oldestAgeMs > filter.maxAgeMs) return false;
    }
    return true;
  });
}

export function sortOpportunities(opps: Opportunity[], key: SortKey): Opportunity[] {
  const value = (o: Opportunity): number => {
    if (key === 'roi') return o.result.roi ?? -Infinity;
    if (key === 'spf') return o.result.spf ?? -Infinity;
    return o.result.netProfit;
  };
  return [...opps].sort((a, b) => value(b) - value(a));
}
