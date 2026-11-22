import {
  BACKPACK_REDUCTION,
  ITEM_WEIGHT,
  type Quality,
  backpackWeight,
  bagCapacity,
  bagWeight,
  oxCapacity,
  oxWeight,
} from '@/data/carry';
import type { Tier } from '@/data/types';

/** Carrying capacity of the character without bag and ox (kg), as reported by the product owner from the game. */
export const DEFAULT_BASE_KG = 50;

/** What the player carries with them. A tier of 0 means "none". */
export interface CarrySetup {
  oxTier: number;
  oxQuality: Quality;
  bagTier: number;
  bagEnchant: number;
  bagQuality: Quality;
  /** Carrying capacity of the character without bag and ox, kg. */
  baseKg: number;
  /** Wear a gatherer backpack of the resource instead of a cape. */
  backpack: boolean;
  backpackTier: number;
}

export interface CapacityBreakdown {
  base: number;
  ox: number;
  bag: number;
  /** base + ox + bag. */
  gross: number;
  oxWeight: number;
  bagWeight: number;
  backpackWeight: number;
  /** Weight of the equipped ox, bag and backpack. */
  gear: number;
  /** gross - gear, never below zero. */
  usable: number;
}

const nz = (n: number | null): number => n ?? 0;

export function capacityBreakdown(setup: CarrySetup): CapacityBreakdown {
  const base = Number.isFinite(setup.baseKg) ? Math.max(0, setup.baseKg) : 0;
  const ox = setup.oxTier > 0 ? nz(oxCapacity(setup.oxTier, setup.oxQuality)) : 0;
  const bag = setup.bagTier > 0 ? nz(bagCapacity(setup.bagTier, setup.bagEnchant, setup.bagQuality)) : 0;
  const oxW = setup.oxTier > 0 ? nz(oxWeight(setup.oxTier)) : 0;
  const bagW = setup.bagTier > 0 ? nz(bagWeight(setup.bagTier)) : 0;
  const bpW = setup.backpack ? nz(backpackWeight(setup.backpackTier)) : 0;
  const gross = base + ox + bag;
  const gear = oxW + bagW + bpW;
  return {
    base,
    ox,
    bag,
    gross,
    oxWeight: oxW,
    bagWeight: bagW,
    backpackWeight: bpW,
    gear,
    usable: Math.max(0, gross - gear),
  };
}

/** Weight in kg of one item, 30 % less when the backpack covers its tier. */
export function unitWeight(tier: Tier, backpackTier: number | null): number {
  const w = ITEM_WEIGHT[tier];
  return backpackTier !== null && tier <= backpackTier ? w * (1 - BACKPACK_REDUCTION) : w;
}

/** Total weight in kg of items by tier. */
export function loadKg(lines: Array<{ tier: Tier; qty: number }>, backpackTier: number | null): number {
  return lines.reduce((sum, l) => sum + Math.max(0, l.qty) * unitWeight(l.tier, backpackTier), 0);
}

export interface TripCheck {
  loadKg: number;
  usableKg: number;
  /** "none": nothing to carry, "no-capacity": nothing to carry it with, otherwise fits or not. */
  status: 'empty' | 'no-capacity' | 'fits' | 'over';
  /** Load as a percentage of the usable capacity. */
  fillPercent: number | null;
  /** How many kg do not fit in one trip. */
  overKg: number;
  /** Trips needed with this capacity. */
  trips: number | null;
}

export function checkTrip(load: number, usable: number): TripCheck {
  if (load <= 1e-9) return { loadKg: 0, usableKg: usable, status: 'empty', fillPercent: 0, overKg: 0, trips: 0 };
  if (usable <= 1e-9) return { loadKg: load, usableKg: usable, status: 'no-capacity', fillPercent: null, overKg: load, trips: null };
  const over = Math.max(0, load - usable);
  return {
    loadKg: load,
    usableKg: usable,
    status: over > 0 ? 'over' : 'fits',
    fillPercent: (load / usable) * 100,
    overKg: over,
    trips: Math.ceil(load / usable - 1e-9),
  };
}
