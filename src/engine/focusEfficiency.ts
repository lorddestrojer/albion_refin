import { baseFocus } from '@/data/focusBase';
import type { Enchant, Resource, Tier } from '@/data/types';

/** Levels (0-100) of the tier nodes T4..T8 of one refining branch. */
export type SpecLevels = Record<4 | 5 | 6 | 7 | 8, number>;
export const SPEC_TIERS = [4, 5, 6, 7, 8] as const;

/** Efficiency points per level: own tier node and any tier node (spec.md section 6). */
export const OWN_TIER_POINTS = 250;
export const ALL_TIERS_POINTS = 30;

export function uniformSpec(level: number): SpecLevels {
  const l = clampLevel(level);
  return { 4: l, 5: l, 6: l, 7: l, 8: l };
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(100, Math.max(0, level));
}

/**
 * Focus Cost Efficiency for refining `tier`:
 * 250 * level of its own node + 30 * sum of the levels of all tier nodes.
 * T2 and T3 have no node of their own (own level 0), but still benefit from the +30 part.
 */
export function focusEfficiency(levels: SpecLevels, tier: Tier): number {
  const sum = SPEC_TIERS.reduce((acc, t) => acc + clampLevel(levels[t]), 0);
  const own = tier >= 4 ? clampLevel(levels[tier as 4 | 5 | 6 | 7 | 8]) : 0;
  return OWN_TIER_POINTS * own + ALL_TIERS_POINTS * sum;
}

/** Focus is halved for every 10 000 efficiency points. */
export function focusCost(base: number, efficiency: number): number {
  return base * 0.5 ** (efficiency / 10000);
}

/** Focus per craft for a recipe, or null when the recipe/enchant does not exist. */
export function focusPerCraft(
  resource: Resource,
  tier: Tier,
  enchant: Enchant,
  levels: SpecLevels,
): number | null {
  const base = baseFocus(resource, tier, enchant);
  if (base === null) return null;
  return focusCost(base, focusEfficiency(levels, tier));
}
