import type { Leg, Opportunity } from './types';

/**
 * The API only gives the lowest sell order, not how many units are on offer.
 * These heuristics flag results that probably cannot be executed at the shown prices.
 */
export type RiskKind = 'single-source' | 'cheap-outlier' | 'sell-outlier' | 'high-roi';

export interface Risk {
  kind: RiskKind;
  message: string;
}

/** Cheapest price below this share of the next cheapest city = suspiciously small stack. */
export const CHEAP_OUTLIER_RATIO = 0.75;
/** Best sell price above this multiple of the next best city = suspiciously high listing. */
export const SELL_OUTLIER_RATIO = 1.3;
/** ROI above this percentage is rare on a deep market. */
export const HIGH_ROI_PERCENT = 100;

function cheapOutlier(label: string, legs: Leg[]): Risk | null {
  if (legs.length < 2) return null;
  const [best, next] = legs;
  if (best.price >= next.price * CHEAP_OUTLIER_RATIO) return null;
  const pct = Math.round((1 - best.price / next.price) * 100);
  return {
    kind: 'cheap-outlier',
    message: `${label} in ${best.city} is ${pct} % cheaper than the next city (${next.city}); it may be a small stack that cannot fill your whole order.`,
  };
}

/** Reasons to doubt that a result can be executed in full. Empty = none found. */
export function marketRisks(o: Opportunity): Risk[] {
  const risks: Risk[] = [];
  const { raw, lower, sell } = o.alternatives;

  const single: string[] = [];
  if (raw.length === 1) single.push('raw material');
  if (o.recipe.lowerRefinedId && lower.length === 1) single.push('lower-tier material');
  if (sell.length === 1) single.push('the refined item');
  if (single.length > 0) {
    risks.push({
      kind: 'single-source',
      message: `Only one city has a price for ${single.join(', ')}, so the price cannot be cross-checked.`,
    });
  }

  const rawRisk = cheapOutlier('The raw material price', raw);
  if (rawRisk) risks.push(rawRisk);
  if (o.recipe.lowerRefinedId) {
    const lowerRisk = cheapOutlier('The lower-tier price', lower);
    if (lowerRisk) risks.push(lowerRisk);
  }

  if (sell.length >= 2 && sell[0].price > sell[1].price * SELL_OUTLIER_RATIO) {
    const pct = Math.round((sell[0].price / sell[1].price - 1) * 100);
    risks.push({
      kind: 'sell-outlier',
      message: `The sell price in ${sell[0].city} is ${pct} % higher than in ${sell[1].city}; only a few items may sell at that price.`,
    });
  }

  const roi = o.result.roi;
  if (roi !== null && roi > HIGH_ROI_PERCENT) {
    risks.push({
      kind: 'high-roi',
      message: `ROI above ${HIGH_ROI_PERCENT} % is unusual; the market is probably thin or the prices outdated.`,
    });
  }
  return risks;
}
