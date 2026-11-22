/** Resource Return Rate in the city specialised for the resource (spec.md 4.3). */
export const RRR_BONUS_CITY = { noFocus: 0.367, focus: 0.539 } as const;

/** Market tax (spec.md 4.4). */
export const TAX_PREMIUM = 0.04;
export const TAX_NO_PREMIUM = 0.08;
/** Setup fee charged when listing a sell order. */
export const SETUP_FEE = 0.025;

export function marketTax(premium: boolean): number {
  return premium ? TAX_PREMIUM : TAX_NO_PREMIUM;
}
