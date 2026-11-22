export type Resource = 'wood' | 'ore' | 'hide' | 'fiber' | 'stone';
export type Server = 'europe' | 'americas' | 'asia';
export type City =
  | 'Bridgewatch'
  | 'Martlock'
  | 'Thetford'
  | 'Fort Sterling'
  | 'Lymhurst'
  | 'Brecilien';

export type Tier = 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Enchant = 0 | 1 | 2 | 3 | 4;

export interface Recipe {
  resource: Resource;
  tier: Tier;
  enchant: Enchant;
  rawId: string;
  rawQty: number;
  refinedId: string;
  /** Lower-tier refined material required (null for T2). */
  lowerRefinedId: string | null;
}
