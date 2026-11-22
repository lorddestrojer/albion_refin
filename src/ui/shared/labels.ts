import { RESOURCES } from '@/data/resources';
import type { Recipe } from '@/data/types';

/** "T4.1 Planks" style label of a recipe's refined output. */
export function recipeLabel(recipe: Pick<Recipe, 'resource' | 'tier' | 'enchant'>): string {
  const e = recipe.enchant > 0 ? `.${recipe.enchant}` : '';
  return `T${recipe.tier}${e} ${RESOURCES[recipe.resource].refinedLabel}`;
}

/** "T4.1 Wood" style label of the raw input. */
export function rawLabel(recipe: Pick<Recipe, 'resource' | 'tier' | 'enchant'>): string {
  const e = recipe.enchant > 0 ? `.${recipe.enchant}` : '';
  return `T${recipe.tier}${e} ${RESOURCES[recipe.resource].label}`;
}
