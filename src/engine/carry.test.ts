import { describe, expect, it } from 'vitest';
import {
  BACKPACK_REDUCTION,
  ITEM_WEIGHT,
  backpackWeight,
  bagCapacity,
  bagEnchants,
  bagWeight,
  oxCapacity,
  oxWeight,
} from '@/data/carry';
import { capacityBreakdown, checkTrip, loadKg, unitWeight, type CarrySetup } from './carry';

const NONE: CarrySetup = {
  oxTier: 0,
  oxQuality: 'normal',
  bagTier: 0,
  bagEnchant: 0,
  bagQuality: 'normal',
  baseKg: 0,
  backpack: false,
  backpackTier: 8,
};

describe('carry data (wiki values)', () => {
  it('ox capacity and weight', () => {
    expect(oxCapacity(8, 'normal')).toBe(3200);
    expect(oxCapacity(8, 'masterpiece')).toBe(3993);
    expect(oxCapacity(3, 'good')).toBe(1591);
    expect(oxCapacity(6, 'excellent')).toBe(2577);
    expect(oxCapacity(2, 'normal')).toBeNull();
    expect(oxWeight(8)).toBe(119.6);
    expect(oxWeight(3)).toBe(15.8);
  });
  it('bag capacity by tier, enchant and quality', () => {
    expect(bagCapacity(2, 0, 'normal')).toBe(43);
    expect(bagCapacity(8, 4, 'masterpiece')).toBe(577);
    expect(bagCapacity(8, 0, 'normal')).toBe(198);
    expect(bagCapacity(5, 2, 'outstanding')).toBe(173);
    // T2/T3 bags cannot be enchanted: the enchant is ignored.
    expect(bagCapacity(3, 4, 'normal')).toBe(57);
    expect(bagCapacity(9, 0, 'normal')).toBeNull();
  });
  it('the enchant ladder repeats across tiers', () => {
    expect(bagCapacity(4, 1, 'normal')).toBe(bagCapacity(5, 0, 'normal'));
    expect(bagCapacity(7, 3, 'good')).toBe(bagCapacity(8, 2, 'good'));
  });
  it('bag and backpack weights, enchants', () => {
    expect(bagWeight(8)).toBe(17.1);
    expect(bagWeight(2)).toBe(1.5);
    expect(backpackWeight(5)).toBe(2.5);
    expect(backpackWeight(8)).toBe(8.5);
    expect(backpackWeight(3)).toBeNull();
    expect(bagEnchants(3)).toEqual([0]);
    expect(bagEnchants(4)).toEqual([0, 1, 2, 3, 4]);
  });
  it('item weight per tier', () => {
    expect(ITEM_WEIGHT[2]).toBe(0.23);
    expect(ITEM_WEIGHT[4]).toBe(0.51);
    expect(ITEM_WEIGHT[8]).toBe(2.56);
    expect(BACKPACK_REDUCTION).toBe(0.3);
  });
});

describe('capacityBreakdown', () => {
  it('ox T8 + bag T8.4 + backpack T8', () => {
    const c = capacityBreakdown({ ...NONE, oxTier: 8, bagTier: 8, bagEnchant: 4, backpack: true, backpackTier: 8 });
    expect(c.gross).toBe(3200 + 469);
    expect(c.gear).toBeCloseTo(119.6 + 17.1 + 8.5, 6);
    expect(c.usable).toBeCloseTo(3669 - 145.2, 6);
  });
  it('quality raises capacity', () => {
    const normal = capacityBreakdown({ ...NONE, oxTier: 8, bagTier: 8 }).usable;
    const best = capacityBreakdown({ ...NONE, oxTier: 8, bagTier: 8, oxQuality: 'masterpiece', bagQuality: 'masterpiece' }).usable;
    expect(best).toBeGreaterThan(normal);
  });
  it('base capacity is added, none means zero, backpack off adds no weight', () => {
    expect(capacityBreakdown(NONE).usable).toBe(0);
    expect(capacityBreakdown({ ...NONE, baseKg: 100 }).usable).toBe(100);
    const c = capacityBreakdown({ ...NONE, oxTier: 4, backpackTier: 8 });
    expect(c.backpackWeight).toBe(0);
    expect(c.gross).toBe(1655);
  });
  it('never goes below zero', () => {
    expect(capacityBreakdown({ ...NONE, bagTier: 8, baseKg: 0, bagQuality: 'normal' }).usable).toBeCloseTo(198 - 17.1, 6);
    expect(capacityBreakdown({ ...NONE, backpack: true }).usable).toBe(0);
  });
  it('ignores NaN and negative base capacity', () => {
    expect(capacityBreakdown({ ...NONE, baseKg: Number.NaN }).base).toBe(0);
    expect(capacityBreakdown({ ...NONE, baseKg: -5 }).base).toBe(0);
  });
});

describe('weights with the backpack', () => {
  it('30 % lighter for the backpack tier and below, full weight above', () => {
    expect(unitWeight(5, null)).toBe(0.76);
    expect(unitWeight(5, 5)).toBeCloseTo(0.532, 6);
    expect(unitWeight(4, 6)).toBeCloseTo(0.357, 6);
    expect(unitWeight(6, 5)).toBe(1.14);
  });
  it('sums lines: 3 stacks + 45 pieces of T4 weigh 1551.42 kg, 1085.99 kg with a T4+ backpack', () => {
    const lines = [{ tier: 4 as const, qty: 3042 }];
    expect(loadKg(lines, null)).toBeCloseTo(1551.42, 2);
    expect(loadKg(lines, 4)).toBeCloseTo(1085.994, 3);
  });
  it('ignores negative quantities', () => {
    expect(loadKg([{ tier: 4, qty: -10 }], null)).toBe(0);
  });
});

describe('checkTrip', () => {
  it('fits with fill percent', () => {
    const t = checkTrip(1500, 3000);
    expect(t.status).toBe('fits');
    expect(t.fillPercent).toBeCloseTo(50, 6);
    expect(t.trips).toBe(1);
    expect(t.overKg).toBe(0);
  });
  it('does not fit: overweight and number of trips', () => {
    const t = checkTrip(7000, 3000);
    expect(t.status).toBe('over');
    expect(t.overKg).toBeCloseTo(4000, 6);
    expect(t.trips).toBe(3);
  });
  it('exactly full still fits', () => {
    expect(checkTrip(3000, 3000).status).toBe('fits');
    expect(checkTrip(3000, 3000).trips).toBe(1);
  });
  it('empty load and no capacity', () => {
    expect(checkTrip(0, 3000).status).toBe('empty');
    expect(checkTrip(100, 0).status).toBe('no-capacity');
    expect(checkTrip(100, 0).trips).toBeNull();
  });
});
