import { describe, expect, it } from 'vitest';
import { getRecipe } from '@/data/recipes';
import { evaluateRecipe, filterOpportunities, type WizardParams } from './optimize';
import { uniformSpec } from './focusEfficiency';
import type { PriceBook } from './types';
import { marketRisks } from './warnings';

const NOW = Date.parse('2026-11-21T18:30:00Z');
const D = '2026-11-21T18:20:00';
const PARAMS: WizardParams = {
  budget: 1_000_000,
  focusMode: false,
  spec: uniformSpec(0),
  premium: true,
  fee100: 315,
  focusPool: 10000,
  now: NOW,
};

/** Evenly priced market in several cities: nothing suspicious. */
function healthy(): PriceBook {
  return {
    T4_WOOD: { Martlock: { price: 100, date: D }, Thetford: { price: 104, date: D }, Lymhurst: { price: 110, date: D } },
    T3_PLANKS: { Martlock: { price: 250, date: D }, Thetford: { price: 260, date: D } },
    T4_PLANKS: { Brecilien: { price: 560, date: D }, Thetford: { price: 540, date: D }, Lymhurst: { price: 530, date: D } },
  };
}

const evalWood = (b: PriceBook) => evaluateRecipe(getRecipe('wood', 4, 0), b, PARAMS)!;
const kinds = (b: PriceBook) => marketRisks(evalWood(b)).map((r) => r.kind);

describe('marketRisks', () => {
  it('reports nothing for an evenly priced, multi-city market with a sane ROI', () => {
    expect(kinds(healthy())).toEqual([]);
  });

  it('flags a raw price far below the next city', () => {
    const b = healthy();
    b.T4_WOOD.Martlock = { price: 60, date: D };
    expect(kinds(b)).toContain('cheap-outlier');
    expect(marketRisks(evalWood(b)).find((r) => r.kind === 'cheap-outlier')?.message).toMatch(/Martlock/);
  });

  it('flags a lower-tier price far below the next city', () => {
    const b = healthy();
    b.T3_PLANKS.Martlock = { price: 120, date: D };
    expect(marketRisks(evalWood(b)).some((r) => r.kind === 'cheap-outlier' && /lower-tier/.test(r.message))).toBe(true);
  });

  it('flags a sell price far above the next city', () => {
    const b = healthy();
    b.T4_PLANKS.Brecilien = { price: 900, date: D };
    expect(kinds(b)).toContain('sell-outlier');
  });

  it('flags prices that exist in only one city', () => {
    const b = healthy();
    b.T3_PLANKS = { Martlock: { price: 250, date: D } };
    const risk = marketRisks(evalWood(b)).find((r) => r.kind === 'single-source');
    expect(risk?.message).toMatch(/lower-tier material/);
  });

  it('flags unusually high ROI', () => {
    const b = healthy();
    b.T4_PLANKS = { Brecilien: { price: 2000, date: D }, Thetford: { price: 1950, date: D } };
    expect(kinds(b)).toContain('high-roi');
  });

  it('does not ask for a lower-tier check on T2 recipes', () => {
    const b: PriceBook = {
      T2_WOOD: { Martlock: { price: 10, date: D }, Thetford: { price: 11, date: D } },
      T2_PLANKS: { Brecilien: { price: 14, date: D }, Thetford: { price: 14, date: D } },
    };
    const o = evaluateRecipe(getRecipe('wood', 2, 0), b, PARAMS)!;
    expect(marketRisks(o)).toEqual([]);
  });
});

describe('hideRisky filter', () => {
  it('removes risky results only when asked', () => {
    const b = healthy();
    b.T4_WOOD.Martlock = { price: 60, date: D };
    const opps = [evalWood(b)];
    expect(filterOpportunities(opps, { minRoi: -1000, maxAgeMs: null })).toHaveLength(1);
    expect(filterOpportunities(opps, { minRoi: -1000, maxAgeMs: null, hideRisky: true })).toHaveLength(0);
    expect(filterOpportunities([evalWood(healthy())], { minRoi: -1000, maxAgeMs: null, hideRisky: true })).toHaveLength(1);
  });
});
