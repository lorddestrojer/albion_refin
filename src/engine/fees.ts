import { nutrition } from '@/data/nutrition';
import { SETUP_FEE, marketTax } from '@/data/rates';

/** Station fee per craft in silver, from the "Fee per 100 nutrition" shown at the station. */
export function stationFeePerCraft(tier: number, enchant: number, fee100: number): number {
  return (nutrition(tier, enchant) * fee100) / 100;
}

/** Share of the listing price that remains after tax and setup fee. */
export function sellFactor(premium: boolean): number {
  return 1 - marketTax(premium) - SETUP_FEE;
}

/** We undercut the lowest sell order by one silver. */
export function listingPrice(lowestSell: number): number {
  return Math.max(0, lowestSell - 1);
}
