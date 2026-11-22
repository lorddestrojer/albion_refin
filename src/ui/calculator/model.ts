import { RRR_BONUS_CITY, SETUP_FEE, marketTax } from '@/data/rates';
import type { Recipe } from '@/data/types';
import { calculate, unitCost } from '@/engine/calc';
import { listingPrice, stationFeePerCraft } from '@/engine/fees';
import { type SpecLevels, focusPerCraft } from '@/engine/focusEfficiency';
import type { CalcInput, CalcResult, Leg } from '@/engine/types';

/** Values the user typed over the API-derived defaults. `undefined` = use the default. */
export interface Overrides {
  rawPrice?: number;
  lowerPrice?: number;
  /** Listing price of the output (lowest sell order minus 1 by default). */
  sellPrice?: number;
  /** Resource return rate in percent. */
  rrrPercent?: number;
  focusPerCraft?: number;
  /** Station fee per craft in silver (otherwise derived from fee per 100 nutrition). */
  feePerCraft?: number;
  sets?: number;
}

export interface DeriveParams {
  recipe: Recipe;
  /** Prices from the API for the chosen cities (null = no data). */
  api: { raw: Leg | null; lower: Leg | null; sell: Leg | null };
  overrides: Overrides;
  premium: boolean;
  focusMode: boolean;
  spec: SpecLevels;
  fee100: number;
  /** Budget used to suggest the number of sets when the user has not typed one. */
  budget: number;
}

export interface Derived {
  /** Defaults computed without overrides, for "reset to API" hints. */
  defaults: {
    rawPrice: number;
    lowerPrice: number;
    sellPrice: number;
    rrrPercent: number;
    focusPerCraft: number | null;
    feePerCraft: number;
    sets: number;
  };
  /** Effective values after overrides. */
  values: {
    rawPrice: number;
    lowerPrice: number;
    sellPrice: number;
    rrrPercent: number;
    focusPerCraft: number | null;
    feePerCraft: number;
    sets: number;
  };
  input: CalcInput;
  result: CalcResult;
}

export function deriveCalc(p: DeriveParams): Derived {
  const lowerQty = p.recipe.lowerRefinedId ? 1 : 0;
  const defRaw = p.api.raw?.price ?? 0;
  const defLower = lowerQty ? (p.api.lower?.price ?? 0) : 0;
  const defSell = p.api.sell ? listingPrice(p.api.sell.price) : 0;
  // Round away binary noise such as 53.900000000000006.
  const defRrr = Number(((p.focusMode ? RRR_BONUS_CITY.focus : RRR_BONUS_CITY.noFocus) * 100).toFixed(3));
  const defFocus = p.focusMode ? focusPerCraft(p.recipe.resource, p.recipe.tier, p.recipe.enchant, p.spec) : null;
  const defFee = stationFeePerCraft(p.recipe.tier, p.recipe.enchant, p.fee100);
  const unitDefault = unitCost({ rawQty: p.recipe.rawQty, rawPrice: defRaw, lowerQty, lowerPrice: defLower });
  const defSets = unitDefault > 0 ? Math.floor(p.budget / unitDefault) : 0;

  const o = p.overrides;
  const values = {
    rawPrice: o.rawPrice ?? defRaw,
    lowerPrice: lowerQty ? (o.lowerPrice ?? defLower) : 0,
    sellPrice: o.sellPrice ?? defSell,
    rrrPercent: o.rrrPercent ?? defRrr,
    focusPerCraft: p.focusMode ? (o.focusPerCraft ?? defFocus) : null,
    feePerCraft: o.feePerCraft ?? defFee,
    sets: o.sets ?? defSets,
  };

  const input: CalcInput = {
    sets: values.sets,
    rawQty: p.recipe.rawQty,
    rawPrice: values.rawPrice,
    lowerQty,
    lowerPrice: values.lowerPrice,
    sellPrice: values.sellPrice,
    rrr: values.rrrPercent / 100,
    taxRate: marketTax(p.premium),
    setupRate: SETUP_FEE,
    feePerCraft: values.feePerCraft,
    focusPerCraft: values.focusPerCraft,
    // Marginal SPF compares with the standard no-Focus return; meaningless if the user overrides the RRR.
    rrrNoFocus: p.focusMode && o.rrrPercent === undefined ? RRR_BONUS_CITY.noFocus : undefined,
  };

  return {
    defaults: {
      rawPrice: defRaw,
      lowerPrice: defLower,
      sellPrice: defSell,
      rrrPercent: defRrr,
      focusPerCraft: defFocus,
      feePerCraft: defFee,
      sets: defSets,
    },
    values,
    input,
    result: calculate(input),
  };
}
