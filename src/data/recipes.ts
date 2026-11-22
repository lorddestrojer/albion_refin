import { RESOURCES, RESOURCE_LIST, TIERS, availableEnchants, itemId } from './resources';
import type { Enchant, Recipe, Resource, Tier } from './types';

/** Raw materials per craft before resource return (spec.md 4.2). */
export const RAW_QTY: Record<Tier, number> = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 5 };

/**
 * Lower-tier refined ingredient (tier, enchant):
 *  - T2: none
 *  - T3: T2.0
 *  - T4.e: T3.0 (unenchanted)
 *  - T5+.e: T(n-1).e (same enchant)
 */
export function lowerRefinedKey(tier: Tier, enchant: Enchant): { tier: Tier; enchant: Enchant } | null {
  if (tier === 2) return null;
  if (tier === 3) return { tier: 2, enchant: 0 };
  if (tier === 4) return { tier: 3, enchant: 0 };
  return { tier: (tier - 1) as Tier, enchant };
}

export function getRecipe(resource: Resource, tier: Tier, enchant: Enchant): Recipe {
  const info = RESOURCES[resource];
  const lower = lowerRefinedKey(tier, enchant);
  return {
    resource,
    tier,
    enchant,
    rawId: itemId(info.rawBase, tier, enchant),
    rawQty: RAW_QTY[tier],
    refinedId: itemId(info.refinedBase, tier, enchant),
    lowerRefinedId: lower ? itemId(info.refinedBase, lower.tier, lower.enchant) : null,
  };
}

export function recipesFor(resource: Resource): Recipe[] {
  const out: Recipe[] = [];
  for (const tier of TIERS) {
    for (const enchant of availableEnchants(resource, tier)) {
      out.push(getRecipe(resource, tier, enchant));
    }
  }
  return out;
}

export function allRecipes(): Recipe[] {
  return RESOURCE_LIST.flatMap(recipesFor);
}

/** Every item ID needed to price the recipes of one resource (raw + refined, deduplicated). */
export function itemIdsFor(resource: Resource): string[] {
  const ids = new Set<string>();
  for (const r of recipesFor(resource)) {
    ids.add(r.rawId);
    ids.add(r.refinedId);
    if (r.lowerRefinedId) ids.add(r.lowerRefinedId);
  }
  return [...ids];
}
