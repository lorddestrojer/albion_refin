import type { City, Resource } from './types';

/** Safe cities only. Caerleon is intentionally excluded everywhere. */
export const CITIES: readonly City[] = [
  'Bridgewatch',
  'Martlock',
  'Thetford',
  'Fort Sterling',
  'Lymhurst',
  'Brecilien',
] as const;

/** City with the +40 % refining bonus for each resource. */
export const BONUS_CITY: Record<Resource, City> = {
  wood: 'Fort Sterling',
  ore: 'Thetford',
  hide: 'Martlock',
  fiber: 'Lymhurst',
  stone: 'Bridgewatch',
};
