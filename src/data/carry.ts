import type { Resource, Tier } from './types';

/** Item quality, which scales the carrying capacity of oxen and bags. */
export type Quality = 'normal' | 'good' | 'outstanding' | 'excellent' | 'masterpiece';
export const QUALITIES: readonly Quality[] = ['normal', 'good', 'outstanding', 'excellent', 'masterpiece'];
export const QUALITY_LABEL: Record<Quality, string> = {
  normal: 'Normal',
  good: 'Good',
  outstanding: 'Outstanding',
  excellent: 'Excellent',
  masterpiece: 'Masterpiece',
};
const QI: Record<Quality, number> = { normal: 0, good: 1, outstanding: 2, excellent: 3, masterpiece: 4 };

/** Weight of one raw or refined item by tier, in kg (same for every line and enchant). */
export const ITEM_WEIGHT: Record<Tier, number> = { 2: 0.23, 3: 0.34, 4: 0.51, 5: 0.76, 6: 1.14, 7: 1.71, 8: 2.56 };

/** Share of the weight that a matching gatherer backpack removes. */
export const BACKPACK_REDUCTION = 0.3;

/** Transport Ox max load in kg by tier (T3..T8) and quality (Normal..Masterpiece). Source: Albion wiki. */
const OX_CAPACITY: Record<number, number[]> = {
  3: [1503, 1591, 1682, 1776, 1978],
  4: [1655, 1744, 1837, 1934, 2139],
  5: [1901, 1998, 2099, 2204, 2426],
  6: [2237, 2346, 2459, 2577, 2828],
  7: [2667, 2792, 2923, 3058, 3347],
  8: [3200, 3347, 3499, 3657, 3993],
};
/** Weight of the Transport Ox item in kg. */
const OX_WEIGHT: Record<number, number> = { 3: 15.8, 4: 23.6, 5: 35.4, 6: 53.2, 7: 79.7, 8: 119.6 };

/** Bag extra capacity in kg, key `tier.enchant`, values by quality. Source: Albion wiki. */
const BAG_CAPACITY: Record<string, number[]> = {
  '2.0': [43, 45, 48, 51, 57],
  '3.0': [57, 61, 64, 68, 76],
  '4.0': [76, 80, 84, 88, 98],
  '4.1': [98, 103, 108, 113, 125],
  '4.2': [125, 131, 137, 144, 158],
  '4.3': [158, 165, 173, 181, 198],
  '4.4': [198, 207, 216, 226, 247],
  '5.0': [98, 103, 108, 113, 125],
  '5.1': [125, 131, 137, 144, 158],
  '5.2': [158, 165, 173, 181, 198],
  '5.3': [198, 207, 216, 226, 247],
  '5.4': [247, 258, 269, 281, 307],
  '6.0': [125, 131, 137, 144, 158],
  '6.1': [158, 165, 173, 181, 198],
  '6.2': [198, 207, 216, 226, 247],
  '6.3': [247, 258, 269, 281, 307],
  '6.4': [307, 320, 334, 349, 380],
  '7.0': [158, 165, 173, 181, 198],
  '7.1': [198, 207, 216, 226, 247],
  '7.2': [247, 258, 269, 281, 307],
  '7.3': [307, 320, 334, 349, 380],
  '7.4': [380, 396, 413, 431, 469],
  '8.0': [198, 207, 216, 226, 247],
  '8.1': [247, 258, 269, 281, 307],
  '8.2': [307, 320, 334, 349, 380],
  '8.3': [380, 396, 413, 431, 469],
  '8.4': [469, 489, 509, 531, 577],
};
/** Weight of the bag item in kg by tier (enchant does not change it). */
const BAG_WEIGHT: Record<number, number> = { 2: 1.5, 3: 2.3, 4: 3.4, 5: 5.1, 6: 7.6, 7: 11.4, 8: 17.1 };

/** Gatherer backpack weight in kg by tier. */
const BACKPACK_WEIGHT: Record<number, number> = { 4: 1.7, 5: 2.5, 6: 3.8, 7: 5.7, 8: 8.5 };

export const OX_TIERS: readonly number[] = [3, 4, 5, 6, 7, 8];
export const BAG_TIERS: readonly number[] = [2, 3, 4, 5, 6, 7, 8];
export const BACKPACK_TIERS: readonly number[] = [4, 5, 6, 7, 8];

export const BACKPACK_NAME: Record<Resource, string> = {
  wood: 'Lumberjack',
  ore: 'Miner',
  hide: 'Skinner',
  fiber: 'Harvester',
  stone: 'Quarrier',
};

/** Enchants a bag of this tier can have (T2 and T3 bags have none). */
export function bagEnchants(tier: number): number[] {
  return tier >= 4 ? [0, 1, 2, 3, 4] : [0];
}

export function oxCapacity(tier: number, quality: Quality): number | null {
  return OX_CAPACITY[tier]?.[QI[quality]] ?? null;
}
export function oxWeight(tier: number): number | null {
  return OX_WEIGHT[tier] ?? null;
}
export function bagCapacity(tier: number, enchant: number, quality: Quality): number | null {
  const e = tier >= 4 ? enchant : 0;
  return BAG_CAPACITY[`${tier}.${e}`]?.[QI[quality]] ?? null;
}
export function bagWeight(tier: number): number | null {
  return BAG_WEIGHT[tier] ?? null;
}
export function backpackWeight(tier: number): number | null {
  return BACKPACK_WEIGHT[tier] ?? null;
}
