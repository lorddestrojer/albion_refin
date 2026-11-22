import { describe, expect, it } from 'vitest';
import { RRR_BONUS_CITY } from '@/data/rates';
import { STACK_SIZE, planGatherer, sellPlan, stockKey, totalFromStacks, type GatherPlan } from './gatherer';
import { focusPerCraft, uniformSpec } from './focusEfficiency';
import type { PriceBook } from './types';

const RRR = RRR_BONUS_CITY.noFocus; // 0.367
const k = stockKey;
const row = (plan: GatherPlan, tier: number, enchant = 0) => plan.rows.find((r) => r.tier === tier && r.enchant === enchant)!;

describe('stacks', () => {
  it('3 stacks + 45 pieces = 3042', () => {
    expect(STACK_SIZE).toBe(999);
    expect(totalFromStacks(3, 45)).toBe(3042);
  });
  it('ignores negatives, NaN and decimals', () => {
    expect(totalFromStacks(-2, 10)).toBe(10);
    expect(totalFromStacks(Number.NaN, 5)).toBe(5);
    expect(totalFromStacks(1.9, 0.9)).toBe(999);
    expect(totalFromStacks(0, 0)).toBe(0);
  });
});

describe('planGatherer: enough material', () => {
  const plan = planGatherer({
    resource: 'wood',
    raw: { [k(2, 0)]: 1000, [k(3, 0)]: 500, [k(4, 0)]: 50 },
    stock: {},
    rrr: RRR,
  });

  it('needs to gather nothing', () => {
    expect(plan.missing).toEqual([]);
  });
  it('computes sets and crafts per tier', () => {
    expect(row(plan, 2).ownSets).toBe(1000);
    expect(row(plan, 3).ownSets).toBe(250);
    expect(row(plan, 4).ownSets).toBe(25);
    expect(row(plan, 2).crafts).toBeCloseTo(1579.78, 1);
    expect(row(plan, 3).crafts).toBeCloseTo(394.94, 1);
    expect(row(plan, 4).crafts).toBeCloseTo(39.49, 1);
  });
  it('the next tier takes what it needs and the rest is surplus', () => {
    expect(row(plan, 2).demand).toBe(250);
    expect(row(plan, 3).demand).toBe(25);
    expect(row(plan, 4).demand).toBe(0);
    expect(row(plan, 2).sellQty).toBe(1329);
    expect(row(plan, 3).sellQty).toBe(369);
    expect(row(plan, 4).sellQty).toBe(39);
  });
});

describe('planGatherer: missing lower tier', () => {
  it('missing T2: T2 100, T3 500 needs 59 more raw T2', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(2, 0)]: 100, [k(3, 0)]: 500 }, stock: {}, rrr: RRR });
    expect(plan.missing).toEqual([{ tier: 2, enchant: 0, raw: 59 }]);
    // After gathering, T3 gets the T2 refined it needs. Only rounding up 58.25 raw to 59 leaves about one spare piece.
    expect(row(plan, 2).surplus).toBeGreaterThanOrEqual(0);
    expect(row(plan, 2).surplus).toBeLessThan(2);
  });

  it('shared T3: T4.0 and T4.1 together draw on the same T3.0', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(4, 0)]: 40, [k(4, 1)]: 40 }, stock: {}, rrr: RRR });
    expect(row(plan, 3).demand).toBe(40);
    // 40 sets of T4 need 40 * 0.633 = 25.3 -> 26 sets of T3 (52 raw), which need 16.5 -> 17 raw T2.
    expect(plan.missing).toEqual([
      { tier: 2, enchant: 0, raw: 17 },
      { tier: 3, enchant: 0, raw: 52 },
    ]);
  });

  it('chains downwards: T5.0 30 raw with nothing below', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(5, 0)]: 30 }, stock: {}, rrr: RRR });
    // Whole crafts: 10 sets T5 -> 7 sets T4 (14 raw) -> 5 sets T3 (10 raw) -> 4 raw T2.
    expect(plan.missing).toEqual([
      { tier: 2, enchant: 0, raw: 4 },
      { tier: 3, enchant: 0, raw: 10 },
      { tier: 4, enchant: 0, raw: 14 },
    ]);
  });

  it('gathering exactly what is reported as missing leaves nothing missing', () => {
    const cases: Array<Record<string, number>> = [
      { [k(8, 0)]: 5 },
      { [k(8, 0)]: 4 },
      { [k(5, 0)]: 30, [k(6, 1)]: 7 },
      { [k(4, 0)]: 41, [k(4, 1)]: 39, [k(7, 2)]: 11 },
    ];
    for (const raw of cases) {
      const first = planGatherer({ resource: 'wood', raw, stock: {}, rrr: RRR });
      const filled = { ...raw };
      for (const m of first.missing) filled[k(m.tier, m.enchant)] = (filled[k(m.tier, m.enchant)] ?? 0) + m.raw;
      const second = planGatherer({ resource: 'wood', raw: filled, stock: {}, rrr: RRR });
      expect(second.missing).toEqual([]);
      expect(second.topUp).toEqual([]);
    }
  });

  it('T8 Wood 5 raw: one whole craft per tier all the way down', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(8, 0)]: 5 }, stock: {}, rrr: RRR });
    expect(plan.missing).toEqual([
      { tier: 2, enchant: 0, raw: 1 },
      { tier: 3, enchant: 0, raw: 2 },
      { tier: 4, enchant: 0, raw: 2 },
      { tier: 5, enchant: 0, raw: 3 },
      { tier: 6, enchant: 0, raw: 4 },
      { tier: 7, enchant: 0, raw: 5 },
    ]);
  });

  it('enchanted chain: T5.2 uses T4.2, which uses T3.0', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(5, 2)]: 30 }, stock: {}, rrr: RRR });
    expect(plan.missing.map((m) => `${m.tier}.${m.enchant}`)).toEqual(['2.0', '3.0', '4.2']);
    expect(row(plan, 4, 0).demand).toBe(0);
  });

  it('refined stock covers the shortage', () => {
    const plan = planGatherer({
      resource: 'wood',
      raw: { [k(5, 0)]: 30 },
      stock: { [k(4, 0)]: 10 },
      rrr: RRR,
    });
    expect(plan.missing).toEqual([]);
    expect(row(plan, 4).surplus).toBeCloseTo(0, 6);
  });

  it('partial stock lowers what has to be gathered', () => {
    const none = planGatherer({ resource: 'wood', raw: { [k(5, 0)]: 30 }, stock: {}, rrr: RRR });
    const some = planGatherer({ resource: 'wood', raw: { [k(5, 0)]: 30 }, stock: { [k(4, 0)]: 5 }, rrr: RRR });
    const total = (p: GatherPlan) => p.missing.reduce((s, m) => s + m.raw, 0);
    expect(total(some)).toBeLessThan(total(none));
  });
});

describe('planGatherer: edge cases', () => {
  it('RRR 0: one craft per set', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(2, 0)]: 100 }, stock: {}, rrr: 0 });
    expect(row(plan, 2).crafts).toBe(100);
    expect(row(plan, 2).sellQty).toBe(100);
  });
  it('raw below one craft stays unused when a higher tier consumes the item', () => {
    // T6 has 8 raw (2 sets), so T5 is consumed by T6; T5 keeps its single leftover raw.
    const plan = planGatherer({ resource: 'wood', raw: { [k(5, 0)]: 7, [k(6, 0)]: 8 }, stock: {}, rrr: RRR });
    expect(row(plan, 5).demand).toBe(2);
    expect(plan.unused).toEqual([{ tier: 5, enchant: 0, raw: 1 }]);
    expect(plan.topUp).toEqual([]);
  });
  it('the highest tier is always refined fully: 4 raw T8 Wood is topped up and pulls in the lower tiers', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(8, 0)]: 4 }, stock: {}, rrr: RRR });
    expect(row(plan, 8).ownSets).toBe(0);
    expect(row(plan, 8).topUpRaw).toBe(1);
    expect(row(plan, 8).totalSets).toBe(1);
    expect(row(plan, 8).unusedRaw).toBe(0);
    expect(plan.topUp).toEqual([{ tier: 8, enchant: 0, raw: 1 }]);
    expect(plan.unused).toEqual([]);
    // One set of T8 needs one refined T7, which needs T7 raw and refined T6 and so on down to T2.
    expect(row(plan, 7).demand).toBe(1);
    expect(plan.missing.map((m) => `${m.tier}.${m.enchant}`)).toEqual(['2.0', '3.0', '4.0', '5.0', '6.0', '7.0', '8.0']);
  });
  it('a top-up is not added when raw already fills whole crafts', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(8, 0)]: 10 }, stock: { [k(7, 0)]: 5 }, rrr: RRR });
    expect(plan.topUp).toEqual([]);
    expect(plan.missing).toEqual([]);
  });
  it('empty input produces an empty plan', () => {
    const plan = planGatherer({ resource: 'ore', raw: {}, stock: {}, rrr: RRR });
    expect(plan.missing).toEqual([]);
    expect(plan.rows.every((r) => r.sellQty === 0)).toBe(true);
    expect(plan.focusTotal).toBeNull();
  });
  it('Stone has only .0 recipes', () => {
    const plan = planGatherer({ resource: 'stone', raw: {}, stock: {}, rrr: RRR });
    expect(plan.rows.every((r) => r.enchant === 0)).toBe(true);
    expect(plan.rows).toHaveLength(7);
  });
  it('T8 output is all surplus', () => {
    const plan = planGatherer({ resource: 'hide', raw: { [k(8, 0)]: 50 }, stock: { [k(8, 0)]: 3 }, rrr: RRR });
    expect(row(plan, 8).demand).toBe(0);
    expect(row(plan, 8).output).toBeCloseTo(10 / 0.633 + 3, 6);
  });
  it('extreme RRR is clamped instead of dividing by zero', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(2, 0)]: 10 }, stock: {}, rrr: 1 });
    expect(Number.isFinite(row(plan, 2).crafts)).toBe(true);
  });
});

describe('planGatherer: Focus', () => {
  it('sums Focus over all crafts, including gathered raw', () => {
    const spec = uniformSpec(100);
    const plan = planGatherer({
      resource: 'wood',
      raw: { [k(4, 0)]: 20 },
      stock: {},
      rrr: RRR_BONUS_CITY.focus,
      focusPerCraft: (t, e) => focusPerCraft('wood', t, e, spec),
    });
    const f = (t: 2 | 3 | 4) => (t === 4 ? 54 / 16 : t === 3 ? 31 / 2 ** (15000 / 10000) : 18 / 2 ** 1.5);
    const expected = row(plan, 4).crafts * f(4) + row(plan, 3).crafts * f(3) + row(plan, 2).crafts * f(2);
    expect(plan.focusTotal).toBeCloseTo(expected, 6);
    expect(plan.focusTotal as number).toBeGreaterThan(0);
  });
});

describe('sellPlan', () => {
  const D = '2026-11-21T18:00:00';
  const prices: PriceBook = {
    T2_PLANKS: { Martlock: { price: 40, date: D }, Thetford: { price: 55, date: D }, Lymhurst: { price: 50, date: D } },
    T3_PLANKS: {},
  };

  it('sells in the city with the highest price, one silver below it', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(2, 0)]: 100, [k(3, 0)]: 20 }, stock: {}, rrr: RRR });
    const lines = sellPlan('wood', plan.rows, prices);
    const t2 = lines.find((l) => l.tier === 2)!;
    expect(t2.best).toMatchObject({ city: 'Thetford', price: 55, listing: 54 });
    expect(t2.alternatives.map((a) => a.city)).toEqual(['Thetford', 'Lymhurst', 'Martlock']);
    expect(t2.qty).toBe(plan.rows.find((r) => r.tier === 2)!.sellQty);
  });

  it('marks items without any price', () => {
    const plan = planGatherer({ resource: 'wood', raw: { [k(3, 0)]: 20 }, stock: {}, rrr: RRR });
    const t3 = sellPlan('wood', plan.rows, prices).find((l) => l.tier === 3)!;
    expect(t3.best).toBeNull();
    expect(t3.alternatives).toEqual([]);
  });

  it('skips items with nothing left to sell and never mentions Caerleon', () => {
    const plan = planGatherer({ resource: 'wood', raw: {}, stock: {}, rrr: RRR });
    expect(sellPlan('wood', plan.rows, prices)).toEqual([]);
    const lines = sellPlan('wood', planGatherer({ resource: 'wood', raw: { [k(2, 0)]: 5 }, stock: {}, rrr: RRR }).rows, prices);
    expect(JSON.stringify(lines)).not.toMatch(/caerleon/i);
  });
});
