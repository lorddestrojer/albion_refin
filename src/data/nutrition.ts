/**
 * Nutrition consumed by one refining craft (spec.md 4.6).
 * Every tier/enchant step doubles it; T2 has no station fee.
 */
export function nutrition(tier: number, enchant: number): number {
  if (tier < 3) return 0;
  return 0.9 * 2 ** (tier - 3 + enchant);
}
