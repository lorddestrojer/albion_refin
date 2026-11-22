import type { Enchant, Resource, Tier } from './types';

export interface ResourceInfo {
  id: Resource;
  label: string;
  refinedLabel: string;
  station: string;
  /** Item ID stem of the raw resource (T4_WOOD). */
  rawBase: string;
  /** Item ID stem of the refined material (T4_PLANKS). */
  refinedBase: string;
}

export const RESOURCES: Record<Resource, ResourceInfo> = {
  wood: { id: 'wood', label: 'Wood', refinedLabel: 'Planks', station: 'Lumbermill', rawBase: 'WOOD', refinedBase: 'PLANKS' },
  ore: { id: 'ore', label: 'Ore', refinedLabel: 'Metal Bars', station: 'Smelter', rawBase: 'ORE', refinedBase: 'METALBAR' },
  hide: { id: 'hide', label: 'Hide', refinedLabel: 'Leather', station: 'Tanner', rawBase: 'HIDE', refinedBase: 'LEATHER' },
  fiber: { id: 'fiber', label: 'Fiber', refinedLabel: 'Cloth', station: 'Weaver', rawBase: 'FIBER', refinedBase: 'CLOTH' },
  stone: { id: 'stone', label: 'Stone', refinedLabel: 'Stone Blocks', station: 'Stonemason', rawBase: 'ROCK', refinedBase: 'STONEBLOCK' },
};

export const RESOURCE_LIST: readonly Resource[] = ['wood', 'ore', 'hide', 'fiber', 'stone'];
export const TIERS: readonly Tier[] = [2, 3, 4, 5, 6, 7, 8];

/** Albion Data API item ID, e.g. T4_WOOD or T5_PLANKS_LEVEL2@2. */
export function itemId(base: string, tier: number, enchant: number): string {
  return enchant > 0 ? `T${tier}_${base}_LEVEL${enchant}@${enchant}` : `T${tier}_${base}`;
}

/**
 * Enchants available for a recipe. Enchanting starts at T4. Stone enchants are
 * out of MVP scope (see spec.md section 2), so Stone is .0 only.
 */
export function availableEnchants(resource: Resource, tier: Tier): Enchant[] {
  if (tier < 4 || resource === 'stone') return [0];
  return [0, 1, 2, 3, 4];
}
