import { RAW_QTY, getRecipe } from '@/data/recipes';
import { availableEnchants } from '@/data/resources';
import type { Enchant, Resource, Tier } from '@/data/types';
import { listingPrice } from './fees';
import { legsAscending } from './optimize';
import type { Leg, PriceBook } from './types';

/** Items per stack in Albion. */
export const STACK_SIZE = 999;

export const stockKey = (tier: number, enchant: number): string => `${tier}.${enchant}`;

/** Total pieces from stacks and loose pieces: 3 stacks + 45 pieces = 3042. */
export function totalFromStacks(stacks: number, units: number): number {
  const s = Number.isFinite(stacks) ? Math.max(0, Math.floor(stacks)) : 0;
  const u = Number.isFinite(units) ? Math.max(0, Math.floor(units)) : 0;
  return s * STACK_SIZE + u;
}

export interface GatherInput {
  resource: Resource;
  /** Raw pieces owned, by `stockKey(tier, enchant)`. */
  raw: Record<string, number>;
  /** Already refined pieces owned, by `stockKey`. */
  stock: Record<string, number>;
  /** Resource return rate used for all crafts (0 to <1). */
  rrr: number;
  /** Focus per craft for a recipe; leave undefined when Focus is off. */
  focusPerCraft?: (tier: Tier, enchant: Enchant) => number | null;
}

export interface GatherRow {
  tier: Tier;
  enchant: Enchant;
  key: string;
  /** Raw pieces owned. */
  rawHave: number;
  /** Raw pieces per craft. */
  rawPerCraft: number;
  /** Purchase-set equivalents from the raw you own: floor(rawHave / rawPerCraft). */
  ownSets: number;
  /** Raw that is not enough for one more craft. */
  unusedRaw: number;
  /** Raw added to finish the last craft of an item nothing else consumes (part of `extraRaw`). */
  topUpRaw: number;
  /** Refined pieces owned. */
  stock: number;
  /** Refined pieces the next tier consumes (including raw you still have to gather). */
  demand: number;
  /** Raw you still have to gather for this item. */
  extraRaw: number;
  /** Sets made from gathered raw (extraRaw / rawPerCraft; a top-up completes one set together with the leftover raw). */
  extraSets: number;
  /** ownSets + extraSets. */
  totalSets: number;
  /** Expected crafts = totalSets / (1 - rrr). */
  crafts: number;
  /** Refined pieces available after refining: crafts + stock. */
  output: number;
  /** Refined pieces left to sell after the next tier took what it needs. */
  surplus: number;
  /** Whole pieces to sell (rounded down). */
  sellQty: number;
  /** Focus for all crafts of this item; null when Focus is off. */
  focus: number | null;
}

export interface GatherPlan {
  /** Ascending by tier, then enchant. */
  rows: GatherRow[];
  /** Raw still to gather, per item. */
  missing: Array<{ tier: Tier; enchant: Enchant; raw: number }>;
  /** Raw that does not fill a whole craft, per item. */
  unused: Array<{ tier: Tier; enchant: Enchant; raw: number }>;
  /** Raw topped up to finish the last craft of the highest tiers (already included in `missing`). */
  topUp: Array<{ tier: Tier; enchant: Enchant; raw: number }>;
  focusTotal: number | null;
}

const ALL_TIERS: readonly Tier[] = [8, 7, 6, 5, 4, 3, 2];

/** Refined items that consume the refined item (tier, enchant) as their lower-tier ingredient. */
function consumers(resource: Resource, tier: Tier, enchant: Enchant): Array<[Tier, Enchant]> {
  if (tier === 8) return [];
  if (tier === 2) return [[3, 0]];
  // Every T4 enchant is crafted from unenchanted T3.
  if (tier === 3) return availableEnchants(resource, 4).map((e): [Tier, Enchant] => [4, e]);
  const next = (tier + 1) as Tier;
  return availableEnchants(resource, next).includes(enchant) ? [[next, enchant]] : [];
}

function clampRrr(rrr: number): number {
  if (!Number.isFinite(rrr)) return 0;
  return Math.min(0.99, Math.max(0, rrr));
}

/**
 * Refine (nearly) everything you own: work from T8 down to T2, let each tier use
 * the refined items of the tier below, and report how much raw still has to be
 * gathered for tiers whose own raw and stock are not enough. Nothing is bought.
 */
export function planGatherer(input: GatherInput): GatherPlan {
  const rrr = clampRrr(input.rrr);
  const keep = 1 - rrr;
  const totals = new Map<string, number>(); // key -> total sets (own + gathered)
  const rows: GatherRow[] = [];

  for (const tier of ALL_TIERS) {
    for (const enchant of availableEnchants(input.resource, tier)) {
      const key = stockKey(tier, enchant);
      const q = RAW_QTY[tier];
      const rawHave = Math.max(0, Math.floor(input.raw[key] ?? 0));
      const stock = Math.max(0, Math.floor(input.stock[key] ?? 0));

      const ownSets = Math.floor(rawHave / q);
      const remainder = rawHave - ownSets * q;

      const demand = consumers(input.resource, tier, enchant).reduce(
        (sum, [t, e]) => sum + (totals.get(stockKey(t, e)) ?? 0),
        0,
      );
      // Sets are whole numbers: a craft needs `q` raw in hand, so raw below `q` cannot start one.
      // Refined pieces needed from crafting: demand minus what you already hold, and `s` sets give s / keep pieces.
      const requiredSets = demand > stock ? Math.ceil((demand - stock) * keep - 1e-9) : 0;
      // Nothing above consumes this item, so its raw is the goal: always refine it fully by topping
      // the last craft up. That in turn pulls the lower tiers into the plan.
      const topUpRaw = demand === 0 && remainder > 0 ? q - remainder : 0;
      const setsFromRaw = topUpRaw > 0 ? ownSets + 1 : ownSets;
      const totalSets = Math.max(requiredSets, setsFromRaw);
      // Raw to gather so that your raw is exactly `totalSets * q` (it also uses up your leftover raw).
      const extraRaw = Math.max(0, totalSets * q - rawHave);
      const extraSets = totalSets - ownSets;
      const unusedRaw = Math.max(0, rawHave + extraRaw - totalSets * q);
      totals.set(key, totalSets);

      const crafts = totalSets / keep;
      const output = crafts + stock;
      const surplus = Math.max(0, output - demand);
      const fn = input.focusPerCraft;
      const focus = fn ? crafts * (fn(tier, enchant) ?? 0) : null;

      rows.push({
        tier,
        enchant,
        key,
        rawHave,
        rawPerCraft: q,
        ownSets,
        unusedRaw,
        topUpRaw,
        stock,
        demand,
        extraRaw,
        extraSets,
        totalSets,
        crafts,
        output,
        surplus,
        sellQty: Math.floor(surplus + 1e-9),
        focus,
      });
    }
  }

  rows.sort((a, b) => a.tier - b.tier || a.enchant - b.enchant);
  return {
    rows,
    missing: rows.filter((r) => r.extraRaw > 0).map((r) => ({ tier: r.tier, enchant: r.enchant, raw: r.extraRaw })),
    unused: rows.filter((r) => r.unusedRaw > 0).map((r) => ({ tier: r.tier, enchant: r.enchant, raw: r.unusedRaw })),
    topUp: rows.filter((r) => r.topUpRaw > 0).map((r) => ({ tier: r.tier, enchant: r.enchant, raw: r.topUpRaw })),
    focusTotal: input.focusPerCraft ? rows.reduce((sum, r) => sum + (r.focus ?? 0), 0) : null,
  };
}

export interface SellLine {
  tier: Tier;
  enchant: Enchant;
  itemId: string;
  qty: number;
  /** Best city by price, or null when no city has a price. */
  best: (Leg & { listing: number }) | null;
  /** Next best cities (best first, includes the chosen one). */
  alternatives: Leg[];
}

/** Where to sell each refined item that is left over: the city with the highest price (listed 1 silver below it). */
export function sellPlan(resource: Resource, rows: GatherRow[], prices: PriceBook): SellLine[] {
  const lines: SellLine[] = [];
  for (const row of rows) {
    if (row.sellQty <= 0) continue;
    const recipe = getRecipe(resource, row.tier, row.enchant);
    const legs = legsAscending(prices, recipe.refinedId).reverse();
    const best = legs[0];
    lines.push({
      tier: row.tier,
      enchant: row.enchant,
      itemId: recipe.refinedId,
      qty: row.sellQty,
      best: best ? { ...best, listing: listingPrice(best.price) } : null,
      alternatives: legs.slice(0, 3),
    });
  }
  return lines;
}
