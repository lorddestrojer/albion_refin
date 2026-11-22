import { describe, expect, it } from 'vitest';
import { getRecipe, recipesFor } from '@/data/recipes';
import { ageMs, parseApiDate } from './age';
import { calculate } from './calc';
import { sellFactor, stationFeePerCraft } from './fees';
import { focusCost, focusEfficiency, focusPerCraft, uniformSpec } from './focusEfficiency';
import {
  evaluateRecipe,
  filterOpportunities,
  findOpportunities,
  legsAscending,
  sortOpportunities,
  type WizardParams,
} from './optimize';
import type { CalcInput, PriceBook } from './types';

const SYNTH: CalcInput = {
  sets: 1000,
  rawQty: 2,
  rawPrice: 100,
  lowerQty: 1,
  lowerPrice: 300,
  sellPrice: 899,
  rrr: 0.367,
  taxRate: 0.04,
  setupRate: 0.025,
  feePerCraft: 20,
  focusPerCraft: null,
};

describe('focus efficiency', () => {
  it('caps at 40 000 with every node at 100', () => {
    for (const t of [4, 5, 6, 7, 8] as const) expect(focusEfficiency(uniformSpec(100), t)).toBe(40000);
  });
  it('28 000 with only the own node at 100', () => {
    const levels = { 4: 0, 5: 0, 6: 100, 7: 0, 8: 0 };
    expect(focusEfficiency(levels, 6)).toBe(28000);
  });
  it('T2/T3 only get the +30 part', () => {
    expect(focusEfficiency(uniformSpec(100), 2)).toBe(15000);
    expect(focusEfficiency(uniformSpec(100), 3)).toBe(15000);
  });
  it('halves per 10 000 points', () => {
    expect(focusCost(54, 10000)).toBeCloseTo(27, 10);
    expect(focusCost(54, 40000)).toBeCloseTo(3.375, 10);
  });
  it('matches the in-game measurement: T4 leather, T4=7, T5=1 -> 47', () => {
    const levels = { 4: 7, 5: 1, 6: 0, 7: 0, 8: 0 };
    expect(focusEfficiency(levels, 4)).toBe(1990);
    const f = focusPerCraft('hide', 4, 0, levels);
    expect(f).not.toBeNull();
    expect(Math.abs((f as number) - 47)).toBeLessThanOrEqual(1);
  });
  it('clamps levels to 0-100 and returns null for impossible recipes', () => {
    expect(focusEfficiency({ 4: 500, 5: -5, 6: 0, 7: 0, 8: 0 }, 4)).toBe(250 * 100 + 30 * 100);
    expect(focusPerCraft('wood', 3, 1, uniformSpec(0))).toBeNull();
  });
});

describe('fees', () => {
  it('station fee per craft from fee per 100 nutrition', () => {
    expect(stationFeePerCraft(4, 0, 315)).toBeCloseTo(5.67, 2);
    expect(stationFeePerCraft(2, 0, 315)).toBe(0);
  });
  it('sell factor', () => {
    expect(sellFactor(true)).toBeCloseTo(0.935, 10);
    expect(sellFactor(false)).toBeCloseTo(0.895, 10);
  });
});

describe('calculate: spec.md synthetic example', () => {
  it('no Focus', () => {
    const r = calculate(SYNTH);
    expect(r.crafts).toBeCloseTo(1579.78, 1);
    expect(r.revenue).toBeCloseTo(1327907, -1);
    expect(r.buyCost).toBe(500000);
    expect(r.stationCost).toBeCloseTo(31596, -1);
    expect(r.invested).toBeCloseTo(531596, -1);
    expect(r.netProfit).toBeCloseTo(796311, -1);
    expect(r.roi).toBeCloseTo(149.8, 1);
    expect(r.outputFloor).toBe(1579);
    expect(r.focusTotal).toBeNull();
    expect(r.spf).toBeNull();
  });
  it('with Focus', () => {
    const r = calculate({ ...SYNTH, rrr: 0.539, focusPerCraft: 54 / 16, rrrNoFocus: 0.367 });
    expect(r.crafts).toBeCloseTo(2169.2, 0);
    expect(r.focusTotal).toBeCloseTo(7321, -1);
    expect(r.spf).toBeCloseTo((r.netProfit as number) / (r.focusTotal as number), 10);
    const base = calculate(SYNTH);
    expect(r.marginalSpf).toBeCloseTo((r.netProfit - base.netProfit) / (r.focusTotal as number), 6);
    expect(r.marginalSpf as number).toBeGreaterThan(0);
  });
  it('break-even sell price gives zero profit', () => {
    const r = calculate(SYNTH);
    const be = calculate({ ...SYNTH, sellPrice: r.breakEvenSell as number });
    expect(be.netProfit).toBeCloseTo(0, 4);
  });
  it('T2 has no lower refined cost', () => {
    const r = calculate({ ...SYNTH, rawQty: 1, lowerQty: 0, lowerPrice: 999 });
    expect(r.lowerUnits).toBe(0);
    expect(r.lowerCost).toBe(0);
    expect(r.buyCost).toBe(100000);
  });
});

describe('calculate: edge cases', () => {
  it('rrr 0 gives one craft per set', () => {
    expect(calculate({ ...SYNTH, rrr: 0 }).crafts).toBe(1000);
  });
  it('zero sets gives zeros and null ratios', () => {
    const r = calculate({ ...SYNTH, sets: 0 });
    expect(r.crafts).toBe(0);
    expect(r.invested).toBe(0);
    expect(r.roi).toBeNull();
    expect(r.breakEvenSell).toBeNull();
  });
  it('clamps absurd RRR instead of dividing by zero', () => {
    const r = calculate({ ...SYNTH, rrr: 1 });
    expect(Number.isFinite(r.crafts)).toBe(true);
  });
  it('zero prices do not produce NaN', () => {
    const r = calculate({ ...SYNTH, rawPrice: 0, lowerPrice: 0, sellPrice: 0, feePerCraft: 0 });
    expect(Number.isNaN(r.netProfit)).toBe(false);
    expect(r.roi).toBeNull();
  });
});

describe('age helpers', () => {
  it('parses API dates as UTC and rejects the placeholder date', () => {
    expect(parseApiDate('2026-11-21T18:00:00')).toBe(Date.parse('2026-11-21T18:00:00Z'));
    expect(parseApiDate('0001-01-01T00:00:00')).toBeNull();
    expect(parseApiDate(null)).toBeNull();
  });
  it('age is never negative', () => {
    const now = Date.parse('2026-11-21T18:30:00Z');
    expect(ageMs('2026-11-21T18:00:00', now)).toBe(30 * 60 * 1000);
    expect(ageMs('2026-11-21T19:00:00', now)).toBe(0);
  });
});

const NOW = Date.parse('2026-11-21T18:30:00Z');
const FRESH = '2026-11-21T18:20:00';
const OLD = '2026-11-20T08:00:00';

function book(): PriceBook {
  // T4 planks: raw in Martlock (cheap) / Thetford, lower refined cheapest in Lymhurst, best sell in Brecilien.
  return {
    T4_WOOD: {
      Martlock: { price: 80, date: FRESH },
      Thetford: { price: 120, date: FRESH },
      'Fort Sterling': { price: 150, date: FRESH },
    },
    T3_PLANKS: {
      Lymhurst: { price: 200, date: OLD },
      Bridgewatch: { price: 260, date: FRESH },
      Martlock: { price: 0, date: null },
    },
    T4_PLANKS: {
      Brecilien: { price: 700, date: FRESH },
      'Fort Sterling': { price: 500, date: FRESH },
      Thetford: { price: 650, date: FRESH },
    },
  };
}

const PARAMS: WizardParams = {
  budget: 1_000_000,
  focusMode: false,
  spec: uniformSpec(0),
  premium: true,
  fee100: 315,
  focusPool: 10000,
  now: NOW,
};

describe('optimizer', () => {
  it('ignores cities without data when ranking legs', () => {
    const legs = legsAscending(book(), 'T3_PLANKS');
    expect(legs.map((l) => l.city)).toEqual(['Lymhurst', 'Bridgewatch']);
  });

  it('picks raw and refined cities independently and the best sell city', () => {
    const o = evaluateRecipe(getRecipe('wood', 4, 0), book(), PARAMS)!;
    expect(o.route).toEqual({
      rawCity: 'Martlock',
      lowerCity: 'Lymhurst',
      refineCity: 'Fort Sterling',
      sellCity: 'Brecilien',
    });
    expect(o.rawPrice).toBe(80);
    expect(o.lowerPrice).toBe(200);
    expect(o.sellPrice).toBe(699);
    expect(o.sets).toBe(Math.floor(1_000_000 / (2 * 80 + 200)));
    expect(o.alternatives.raw.map((l) => l.city)).toEqual(['Martlock', 'Thetford', 'Fort Sterling']);
    expect(o.alternatives.sell[0].city).toBe('Brecilien');
  });

  it('reports the oldest price age and null when a date is unknown', () => {
    const o = evaluateRecipe(getRecipe('wood', 4, 0), book(), PARAMS)!;
    expect(o.oldestAgeMs).toBe(NOW - Date.parse(`${OLD}Z`));
    const b = book();
    b.T4_WOOD.Martlock = { price: 80, date: null };
    expect(evaluateRecipe(getRecipe('wood', 4, 0), b, PARAMS)!.oldestAgeMs).toBeNull();
  });

  it('returns null when a needed price is missing', () => {
    const b = book();
    delete b.T4_PLANKS;
    expect(evaluateRecipe(getRecipe('wood', 4, 0), b, PARAMS)).toBeNull();
    expect(evaluateRecipe(getRecipe('wood', 5, 0), book(), PARAMS)).toBeNull();
  });

  it('returns null when the budget buys nothing', () => {
    expect(evaluateRecipe(getRecipe('wood', 4, 0), book(), { ...PARAMS, budget: 100 })).toBeNull();
  });

  it('limits crafts by the Focus pool', () => {
    const params = { ...PARAMS, focusMode: true, focusPool: 540 };
    const o = evaluateRecipe(getRecipe('wood', 4, 0), book(), params)!;
    // base 54 Focus per craft at 0 spec -> at most 10 crafts -> sets = floor(10 * (1 - 0.539))
    expect(o.sets).toBe(Math.floor(10 * (1 - 0.539)));
    expect(o.result.focusTotal as number).toBeLessThanOrEqual(540 + 1e-6);
  });

  it('uses the Focus RRR in Focus mode and fills SPF', () => {
    const o = evaluateRecipe(getRecipe('wood', 4, 0), book(), { ...PARAMS, focusMode: true, spec: uniformSpec(100) })!;
    expect(o.result.crafts).toBeCloseTo(o.sets / (1 - 0.539), 6);
    expect(o.result.spf).not.toBeNull();
    expect(o.result.marginalSpf).not.toBeNull();
  });

  it('T2 recipes need no lower refined price', () => {
    const b: PriceBook = {
      T2_WOOD: { Martlock: { price: 10, date: FRESH } },
      T2_PLANKS: { Thetford: { price: 40, date: FRESH } },
    };
    const o = evaluateRecipe(getRecipe('wood', 2, 0), b, PARAMS)!;
    expect(o.route.lowerCity).toBeNull();
    expect(o.result.lowerCost).toBe(0);
    expect(o.result.stationCost).toBe(0);
  });

  it('never routes through Caerleon', () => {
    const opps = findOpportunities(recipesFor('wood'), book(), PARAMS);
    expect(JSON.stringify(opps)).not.toMatch(/caerleon/i);
  });

  it('filters by ROI and age and sorts by the chosen key', () => {
    const opps = findOpportunities(recipesFor('wood'), book(), PARAMS);
    expect(opps).toHaveLength(1);
    const o = opps[0];
    expect(filterOpportunities(opps, { minRoi: 0, maxAgeMs: null })).toHaveLength(1);
    expect(filterOpportunities(opps, { minRoi: 1e9, maxAgeMs: null })).toHaveLength(0);
    expect(filterOpportunities(opps, { minRoi: 0, maxAgeMs: 60 * 60 * 1000 })).toHaveLength(0);
    expect(filterOpportunities(opps, { minRoi: 0, maxAgeMs: 48 * 3600 * 1000 })).toHaveLength(1);

    const worse = { ...o, result: { ...o.result, roi: 1, netProfit: 9e9, spf: null } };
    const better = { ...o, result: { ...o.result, roi: 500, netProfit: 1, spf: 3 } };
    expect(sortOpportunities([worse, better], 'roi')[0]).toBe(better);
    expect(sortOpportunities([worse, better], 'profit')[0]).toBe(worse);
    expect(sortOpportunities([worse, better], 'spf')[0]).toBe(better);
  });
});
