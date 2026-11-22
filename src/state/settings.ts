import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { RESOURCE_LIST } from '@/data/resources';
import type { Enchant, Resource, Server, Tier } from '@/data/types';
import { type SpecLevels, uniformSpec } from '@/engine/focusEfficiency';
import type { SortKey } from '@/engine/optimize';
import type { City } from '@/data/types';
import { type CarrySetup, DEFAULT_BASE_KG } from '@/engine/carry';

export type View = 'wizard' | 'calculator' | 'gatherer';

/** Recipe (and optionally route and size) handed from the Wizard to the Calculator. */
export interface CalcSeed {
  resource: Resource;
  tier: Tier;
  enchant: Enchant;
  rawCity?: City;
  lowerCity?: City | null;
  sellCity?: City;
  sets?: number;
}

export interface WizardSettings {
  resource: Resource;
  budget: number;
  minRoi: number;
  /** Maximum age of prices in hours; null = no limit. */
  maxAgeHours: number | null;
  focusPool: number;
  sort: SortKey;
  /** Hide results with thin-market warnings. */
  hideRisky: boolean;
}

/** Stacks of 999 plus loose pieces, as typed by the user. */
export interface StockCell {
  stacks: number;
  units: number;
}
/** Cells by `stockKey(tier, enchant)`. */
export type StockGrid = Record<string, StockCell>;
export interface GathererInventory {
  raw: StockGrid;
  refined: StockGrid;
}
export interface GathererSettings {
  resource: Resource;
  inventory: Record<Resource, GathererInventory>;
}

function emptyInventory(): Record<Resource, GathererInventory> {
  return Object.fromEntries(RESOURCE_LIST.map((r) => [r, { raw: {}, refined: {} }])) as Record<Resource, GathererInventory>;
}

/** Example fees per 100 nutrition measured in game; the user edits them to match their station. */
export const DEFAULT_FEE100: Record<Resource, number> = {
  wood: 315,
  ore: 315,
  hide: 315,
  fiber: 315,
  stone: 970,
};

export interface SettingsState {
  server: Server;
  premium: boolean;
  focusMode: boolean;
  /** Tier node levels per refining branch. */
  spec: Record<Resource, SpecLevels>;
  fee100: Record<Resource, number>;
  cacheTtlMin: number;
  wizard: WizardSettings;
  gatherer: GathererSettings;
  /** Ox, bag and backpack used to carry the material (Gatherer). */
  carry: CarrySetup;
  view: View;
  seed: CalcSeed | null;

  setServer: (server: Server) => void;
  setPremium: (premium: boolean) => void;
  setFocusMode: (focusMode: boolean) => void;
  setSpecLevel: (resource: Resource, tier: 4 | 5 | 6 | 7 | 8, level: number) => void;
  applyPreset: (level: number) => void;
  setFee100: (resource: Resource, value: number) => void;
  setCacheTtlMin: (minutes: number) => void;
  patchWizard: (patch: Partial<WizardSettings>) => void;
  setView: (view: View) => void;
  openCalculator: (seed: CalcSeed | null) => void;
  setGathererResource: (resource: Resource) => void;
  setGathererCell: (resource: Resource, kind: 'raw' | 'refined', key: string, field: keyof StockCell, value: number) => void;
  clearGatherer: (resource: Resource) => void;
  setCarry: (patch: Partial<CarrySetup>) => void;
}

function uniformForAll(level: number): Record<Resource, SpecLevels> {
  return Object.fromEntries(RESOURCE_LIST.map((r) => [r, uniformSpec(level)])) as Record<Resource, SpecLevels>;
}

const clampLevel = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      server: 'europe',
      premium: true,
      focusMode: false,
      spec: uniformForAll(0),
      fee100: { ...DEFAULT_FEE100 },
      cacheTtlMin: 5,
      wizard: {
        resource: 'wood',
        budget: 1_000_000,
        minRoi: 0,
        maxAgeHours: 24,
        focusPool: 10_000,
        sort: 'roi',
        hideRisky: false,
      },
      gatherer: { resource: 'wood', inventory: emptyInventory() },
      carry: {
        oxTier: 0,
        oxQuality: 'normal',
        bagTier: 0,
        bagEnchant: 0,
        bagQuality: 'normal',
        baseKg: DEFAULT_BASE_KG,
        backpack: false,
        backpackTier: 8,
      },
      view: 'wizard',
      seed: null,

      setServer: (server) => set({ server }),
      setPremium: (premium) => set({ premium }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setSpecLevel: (resource, tier, level) =>
        set((s) => ({ spec: { ...s.spec, [resource]: { ...s.spec[resource], [tier]: clampLevel(level) } } })),
      applyPreset: (level) => set({ spec: uniformForAll(clampLevel(level)) }),
      setFee100: (resource, value) =>
        set((s) => ({ fee100: { ...s.fee100, [resource]: Number.isFinite(value) ? Math.max(0, value) : 0 } })),
      setCacheTtlMin: (minutes) => set({ cacheTtlMin: Math.max(0, Number.isFinite(minutes) ? minutes : 5) }),
      patchWizard: (patch) => set((s) => ({ wizard: { ...s.wizard, ...patch } })),
      setView: (view) => set({ view }),
      openCalculator: (seed) => set({ seed, view: 'calculator' }),
      setGathererResource: (resource) => set((s) => ({ gatherer: { ...s.gatherer, resource } })),
      setCarry: (patch) => set((s) => ({ carry: { ...s.carry, ...patch } })),
      setGathererCell: (resource, kind, key, field, value) =>
        set((s) => {
          const inv = s.gatherer.inventory[resource];
          const cell = inv[kind][key] ?? { stacks: 0, units: 0 };
          const clean = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
          const next = { ...inv, [kind]: { ...inv[kind], [key]: { ...cell, [field]: clean } } };
          return { gatherer: { ...s.gatherer, inventory: { ...s.gatherer.inventory, [resource]: next } } };
        }),
      clearGatherer: (resource) =>
        set((s) => ({
          gatherer: { ...s.gatherer, inventory: { ...s.gatherer.inventory, [resource]: { raw: {}, refined: {} } } },
        })),
    }),
    {
      name: 'albion-refin-settings',
      version: 2,
      // v1 stored 0 kg as the base capacity default; the real value is 50 kg.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2 && p.carry && p.carry.baseKg === 0) p.carry = { ...p.carry, baseKg: DEFAULT_BASE_KG };
        return p as SettingsState;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        server: s.server,
        premium: s.premium,
        focusMode: s.focusMode,
        spec: s.spec,
        fee100: s.fee100,
        cacheTtlMin: s.cacheTtlMin,
        wizard: s.wizard,
        gatherer: s.gatherer,
        carry: s.carry,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          spec: { ...current.spec, ...p.spec },
          fee100: { ...current.fee100, ...p.fee100 },
          wizard: { ...current.wizard, ...p.wizard },
          carry: { ...current.carry, ...p.carry },
          gatherer: {
            ...current.gatherer,
            ...p.gatherer,
            inventory: { ...current.gatherer.inventory, ...p.gatherer?.inventory },
          },
        };
      },
    },
  ),
);
