import type { CalcInput, CalcResult } from './types';

const MAX_RRR = 0.99;

function clampRrr(rrr: number): number {
  if (!Number.isFinite(rrr)) return 0;
  return Math.min(MAX_RRR, Math.max(0, rrr));
}

/** Expected crafts from `sets` purchased sets: returned materials are refined again (geometric series). */
export function craftsFor(sets: number, rrr: number): number {
  return sets / (1 - clampRrr(rrr));
}

/** Silver value of the inputs of one craft, before resource return. */
export function unitCost(input: Pick<CalcInput, 'rawQty' | 'rawPrice' | 'lowerQty' | 'lowerPrice'>): number {
  return input.rawQty * input.rawPrice + input.lowerQty * input.lowerPrice;
}

function netProfit(input: CalcInput, rrr: number): number {
  const crafts = craftsFor(input.sets, rrr);
  const unit = unitCost(input);
  const revenue = crafts * input.sellPrice * (1 - input.taxRate - input.setupRate);
  return revenue - input.sets * unit - crafts * input.feePerCraft;
}

/** Pure refining profit calculation (spec.md section 5). */
export function calculate(input: CalcInput): CalcResult {
  const sets = Math.max(0, input.sets);
  const rrr = clampRrr(input.rrr);
  const crafts = craftsFor(sets, rrr);

  const rawUnits = sets * input.rawQty;
  const lowerUnits = sets * input.lowerQty;
  const rawCost = rawUnits * input.rawPrice;
  const lowerCost = lowerUnits * input.lowerPrice;
  const buyCost = rawCost + lowerCost;
  const stationCost = crafts * input.feePerCraft;
  const invested = buyCost + stationCost;
  const keep = 1 - input.taxRate - input.setupRate;
  const revenue = crafts * input.sellPrice * keep;
  const net = revenue - buyCost - stationCost;

  const focusPer = input.focusPerCraft;
  const focusTotal = focusPer === null ? null : crafts * focusPer;
  const spf = focusTotal !== null && focusTotal > 0 ? net / focusTotal : null;

  let marginalSpf: number | null = null;
  if (focusTotal !== null && focusTotal > 0 && input.rrrNoFocus !== undefined) {
    const without = netProfit({ ...input, sets }, clampRrr(input.rrrNoFocus));
    marginalSpf = (net - without) / focusTotal;
  }

  return {
    rawUnits,
    lowerUnits,
    rawCost,
    lowerCost,
    crafts,
    outputFloor: Math.floor(crafts + 1e-9),
    revenue,
    buyCost,
    stationCost,
    invested,
    netProfit: net,
    roi: invested > 0 ? (net / invested) * 100 : null,
    focusTotal,
    spf,
    marginalSpf,
    breakEvenSell: crafts > 0 && keep > 0 ? invested / (crafts * keep) : null,
  };
}
