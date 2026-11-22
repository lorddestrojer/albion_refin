import { describe, expect, it } from 'vitest';
import { BONUS_CITY, CITIES } from './cities';
import { baseFocus } from './focusBase';
import { nutrition } from './nutrition';
import { marketTax } from './rates';
import { allRecipes, getRecipe, itemIdsFor, recipesFor } from './recipes';
import { itemId } from './resources';

describe('cities', () => {
  it('has six safe cities and never Caerleon', () => {
    expect(CITIES).toHaveLength(6);
    expect(CITIES).toContain('Brecilien');
    expect(JSON.stringify({ CITIES, BONUS_CITY })).not.toMatch(/caerleon/i);
  });
  it('maps bonus cities', () => {
    expect(BONUS_CITY).toEqual({
      wood: 'Fort Sterling',
      ore: 'Thetford',
      hide: 'Martlock',
      fiber: 'Lymhurst',
      stone: 'Bridgewatch',
    });
  });
});

describe('item ids', () => {
  it('builds plain and enchanted ids', () => {
    expect(itemId('WOOD', 4, 0)).toBe('T4_WOOD');
    expect(itemId('PLANKS', 5, 2)).toBe('T5_PLANKS_LEVEL2@2');
  });
});

describe('recipes', () => {
  it('T2 uses raw only', () => {
    expect(getRecipe('wood', 2, 0)).toMatchObject({
      rawId: 'T2_WOOD',
      rawQty: 1,
      refinedId: 'T2_PLANKS',
      lowerRefinedId: null,
    });
  });
  it('T3 needs T2 refined', () => {
    expect(getRecipe('ore', 3, 0)).toMatchObject({ rawQty: 2, lowerRefinedId: 'T2_METALBAR' });
  });
  it('T4 enchanted uses unenchanted T3 refined', () => {
    expect(getRecipe('wood', 4, 1)).toMatchObject({
      rawId: 'T4_WOOD_LEVEL1@1',
      refinedId: 'T4_PLANKS_LEVEL1@1',
      lowerRefinedId: 'T3_PLANKS',
      rawQty: 2,
    });
  });
  it('T5+ enchanted uses same-enchant lower tier', () => {
    expect(getRecipe('hide', 5, 2).lowerRefinedId).toBe('T4_LEATHER_LEVEL2@2');
    expect(getRecipe('fiber', 8, 4)).toMatchObject({ lowerRefinedId: 'T7_CLOTH_LEVEL4@4', rawQty: 5 });
  });
  it('raw quantity table', () => {
    const qty = ([2, 3, 4, 5, 6, 7, 8] as const).map((t) => getRecipe('wood', t, 0).rawQty);
    expect(qty).toEqual([1, 2, 2, 3, 4, 5, 5]);
  });
  it('counts: 27 for enchantable lines, 7 for stone (.0 only in MVP)', () => {
    expect(recipesFor('wood')).toHaveLength(27);
    expect(recipesFor('stone')).toHaveLength(7);
    expect(allRecipes()).toHaveLength(4 * 27 + 7);
  });
  it('item id list is deduplicated and contains raw and refined', () => {
    const ids = itemIdsFor('wood');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('T8_WOOD_LEVEL4@4');
    expect(ids).toContain('T3_PLANKS');
  });
});

describe('taxes', () => {
  it('premium 4 %, none 8 %', () => {
    expect(marketTax(true)).toBe(0.04);
    expect(marketTax(false)).toBe(0.08);
  });
});

describe('base focus', () => {
  it('matches spec tables', () => {
    expect(baseFocus('wood', 2, 0)).toBe(18);
    expect(baseFocus('wood', 4, 0)).toBe(54);
    expect(baseFocus('hide', 8, 4)).toBe(4714);
    expect(baseFocus('stone', 5, 3)).toBe(752);
  });
  it('returns null for unavailable', () => {
    expect(baseFocus('wood', 3, 1)).toBeNull();
    expect(baseFocus('stone', 4, 4)).toBeNull();
  });
});

describe('nutrition vs in-game fee measurements (fee per craft, tolerance 1)', () => {
  const fee = (tier: number, e: number, fee100: number) => (nutrition(tier, e) * fee100) / 100;
  const wood: Array<[number, number, number]> = [
    [2, 0, 0],
    [3, 0, 3],
    [4, 0, 6], [4, 1, 11], [4, 2, 23], [4, 3, 45], [4, 4, 91],
    [5, 0, 11], [5, 1, 23], [5, 2, 45], [5, 3, 91], [5, 4, 181],
    [6, 0, 23], [6, 1, 45], [6, 2, 91], [6, 3, 181], [6, 4, 363],
    [7, 0, 45], [7, 1, 91], [7, 2, 181], [7, 3, 363], [7, 4, 726],
    [8, 0, 91], [8, 1, 181], [8, 2, 363], [8, 3, 726], [8, 4, 1452],
  ];
  it.each(wood)('wood T%i.%i at 315 gives %i', (t, e, expected) => {
    expect(Math.abs(fee(t, e, 315) - expected)).toBeLessThanOrEqual(1);
  });
  const stone: Array<[number, number, number]> = [
    [3, 0, 9],
    [4, 0, 17], [4, 1, 35], [4, 2, 70], [4, 3, 140], [4, 4, 279],
    [5, 4, 559], [6, 4, 1117], [7, 4, 2235], [8, 4, 4470],
  ];
  it.each(stone)('stone T%i.%i at 970 gives %i', (t, e, expected) => {
    expect(Math.abs(fee(t, e, 970) - expected)).toBeLessThanOrEqual(1);
  });
});
