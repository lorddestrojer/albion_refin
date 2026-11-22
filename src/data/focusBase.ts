import type { Enchant, Resource, Tier } from './types';

/** Base Focus cost per craft at 0 efficiency; rows T2..T8, columns .0 to .4 (spec.md 4.5). */
const GENERAL: Record<Tier, Array<number | null>> = {
  2: [18, null, null, null, null],
  3: [31, null, null, null, null],
  4: [54, 94, 164, 287, 503],
  5: [94, 164, 287, 503, 880],
  6: [164, 287, 503, 880, 1539],
  7: [287, 503, 880, 1539, 2694],
  8: [503, 880, 1539, 2694, 4714],
};

/** Stone has its own table and no .4. */
const STONE: Record<Tier, Array<number | null>> = {
  2: [18, null, null, null, null],
  3: [31, null, null, null, null],
  4: [54, 108, 216, 432, null],
  5: [94, 188, 376, 752, null],
  6: [164, 328, 656, 1312, null],
  7: [287, 574, 1148, 2296, null],
  8: [503, 1006, 2012, 4024, null],
};

export function baseFocus(resource: Resource, tier: Tier, enchant: Enchant): number | null {
  const table = resource === 'stone' ? STONE : GENERAL;
  return table[tier][enchant] ?? null;
}
