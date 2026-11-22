import { type ReactNode, useMemo, useState } from 'react';
import { useMarket } from '@/api/useMarket';
import { BONUS_CITY } from '@/data/cities';
import { RRR_BONUS_CITY } from '@/data/rates';
import { getRecipe, recipesFor } from '@/data/recipes';
import { RESOURCES, RESOURCE_LIST } from '@/data/resources';
import type { Enchant, Resource, Tier } from '@/data/types';
import { ageMs } from '@/engine/age';
import { focusPerCraft } from '@/engine/focusEfficiency';
import { STACK_SIZE, planGatherer, sellPlan, stockKey, totalFromStacks } from '@/engine/gatherer';
import { type StockGrid, useSettings } from '@/state/settings';
import AgeBadge from '../shared/AgeBadge';
import DataBanner from '../shared/DataBanner';
import SpecPanel from '../shared/SpecPanel';
import { Field, NumberInput, inputCls } from '../shared/fields';
import { fmtNum, fmtSilver } from '../shared/format';
import { rawLabel, recipeLabel } from '../shared/labels';
import { useNow } from '../shared/useNow';
import { TransportPanel, TransportResult } from './Transport';

function totals(grid: StockGrid | undefined, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const c = grid?.[k];
    out[k] = c ? totalFromStacks(c.stacks, c.units) : 0;
  }
  return out;
}

export default function GathererView() {
  const server = useSettings((s) => s.server);
  const focusMode = useSettings((s) => s.focusMode);
  const spec = useSettings((s) => s.spec);
  const focusPool = useSettings((s) => s.wizard.focusPool);
  const ttl = useSettings((s) => s.cacheTtlMin);
  const resource = useSettings((s) => s.gatherer.resource);
  const inventory = useSettings((s) => s.gatherer.inventory[resource]);
  const setResource = useSettings((s) => s.setGathererResource);
  const setCell = useSettings((s) => s.setGathererCell);
  const clear = useSettings((s) => s.clearGatherer);
  const patchWizard = useSettings((s) => s.patchWizard);

  const now = useNow();
  const market = useMarket(server, resource, ttl * 60_000);
  const recipes = useMemo(() => recipesFor(resource), [resource]);
  const keys = useMemo(() => recipes.map((r) => stockKey(r.tier, r.enchant)), [recipes]);
  const rawTotals = useMemo(() => totals(inventory.raw, keys), [inventory.raw, keys]);
  const stockTotals = useMemo(() => totals(inventory.refined, keys), [inventory.refined, keys]);

  const hasRefined = Object.values(stockTotals).some((n) => n > 0);
  const [showRefined, setShowRefined] = useState(false);
  const refinedVisible = showRefined || hasRefined;

  // T4–T8 enchants (.1–.4) are collapsed by default; a tier with entered data always stays open.
  const enchantedTiers = useMemo(() => new Set(recipes.filter((r) => r.tier >= 4 && r.enchant > 0).map((r) => r.tier)), [recipes]);
  const [expandedTiers, setExpandedTiers] = useState<ReadonlySet<number>>(new Set());
  const toggleTier = (tier: number) =>
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (!next.delete(tier)) next.add(tier);
      return next;
    });
  const tiersWithData = useMemo(
    () => new Set(recipes.filter((r) => r.enchant > 0 && (rawTotals[stockKey(r.tier, r.enchant)] > 0 || stockTotals[stockKey(r.tier, r.enchant)] > 0)).map((r) => r.tier)),
    [recipes, rawTotals, stockTotals],
  );

  const rrr = focusMode ? RRR_BONUS_CITY.focus : RRR_BONUS_CITY.noFocus;
  const plan = useMemo(
    () =>
      planGatherer({
        resource,
        raw: rawTotals,
        stock: stockTotals,
        rrr,
        focusPerCraft: focusMode ? (t, e) => focusPerCraft(resource, t, e, spec[resource]) : undefined,
      }),
    [resource, rawTotals, stockTotals, rrr, focusMode, spec],
  );
  const book = market.result?.book;
  const sells = useMemo(() => (book ? sellPlan(resource, plan.rows, book) : []), [resource, plan.rows, book]);

  const anyInput = Object.values(rawTotals).some((n) => n > 0) || hasRefined;
  const activeRows = plan.rows.filter((r) => r.rawHave > 0 || r.stock > 0 || r.extraRaw > 0 || r.demand > 0);
  const label = (tier: number, enchant: number) => rawLabel({ resource, tier: tier as Tier, enchant: enchant as Enchant });

  return (
    <div className="flex flex-col gap-4">
      <DataBanner market={market} />

      <section className="flex flex-wrap items-end gap-4 rounded border border-border bg-panel p-3" aria-label="Gatherer settings">
        <div className="min-w-48">
          <Field label="Resource">
            <select className={inputCls} value={resource} onChange={(e) => setResource(e.target.value as Resource)} aria-label="Resource">
              {RESOURCE_LIST.map((r) => (
                <option key={r} value={r}>
                  {RESOURCES[r].label} → {RESOURCES[r].refinedLabel}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted">
          Refining in the bonus city with RRR {fmtNum(rrr * 100)} % ({focusMode ? 'with' : 'without'} Focus). Stack = {STACK_SIZE} pieces. Nothing is bought:
          what is missing has to be gathered.
        </p>
        <button
          type="button"
          onClick={() => clear(resource)}
          className="ml-auto rounded border border-border bg-panel-2 px-3 py-1.5 text-xs hover:border-accent"
        >
          Clear {RESOURCES[resource].label}
        </button>
        {focusMode ? (
          <>
            <div className="w-44">
              <Field label="Available Focus" hint="Shared with the Wizard">
                <NumberInput value={focusPool} min={0} step={1000} ariaLabel="Available Focus" onChange={(n) => patchWizard({ focusPool: n })} />
              </Field>
            </div>
            <div className="w-full">
              <SpecPanel resource={resource} />
            </div>
          </>
        ) : null}
      </section>

      <TransportPanel resource={resource} />

      {anyInput ? (
        <Summary plan={plan} resource={resource} focusMode={focusMode} focusPool={focusPool} label={label}>
          <TransportResult plan={plan} resource={resource} city={BONUS_CITY[resource]} />
        </Summary>
      ) : null}

      <section className="rounded border border-border bg-panel" aria-label="What you gathered">
        <div className="flex items-center justify-between px-3 pt-3">
          <h2 className="text-sm font-semibold text-accent">What you have</h2>
          <button
            type="button"
            aria-expanded={refinedVisible}
            onClick={() => setShowRefined((v) => !v)}
            disabled={hasRefined}
            className="text-xs text-accent underline disabled:no-underline disabled:opacity-60"
          >
            {refinedVisible ? 'Refined items you already have' : 'I also have refined items'}
          </button>
        </div>
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Item</th>
                <th className="px-2 py-1 text-right font-medium">Raw stacks</th>
                <th className="px-2 py-1 text-right font-medium">+ pieces</th>
                <th className="px-2 py-1 text-right font-medium">Raw total</th>
                {refinedVisible ? (
                  <>
                    <th className="px-2 py-1 text-right font-medium">Refined stacks</th>
                    <th className="px-2 py-1 text-right font-medium">+ pieces</th>
                    <th className="px-2 py-1 text-right font-medium">Refined total</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => {
                const key = stockKey(r.tier, r.enchant);
                const collapsible = r.tier >= 4 && enchantedTiers.has(r.tier);
                const open = expandedTiers.has(r.tier) || tiersWithData.has(r.tier);
                if (collapsible && r.enchant > 0 && !open) return null;
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="py-1 pr-2">
                      {collapsible && r.enchant === 0 ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} T${r.tier} enchants`}
                          disabled={tiersWithData.has(r.tier)}
                          onClick={() => toggleTier(r.tier)}
                          className="flex items-center gap-1.5 text-left hover:text-accent disabled:cursor-default disabled:hover:text-inherit"
                        >
                          <span aria-hidden className="w-3 text-xs text-muted">
                            {open ? '▾' : '▸'}
                          </span>
                          <span>{label(r.tier, r.enchant)}</span>
                        </button>
                      ) : (
                        <span className={collapsible && r.enchant > 0 ? 'pl-[30px]' : enchantedTiers.size > 0 ? 'pl-[18px]' : ''}>{label(r.tier, r.enchant)}</span>
                      )}
                    </td>
                    <QtyCells
                      name={`${label(r.tier, r.enchant)} raw`}
                      cell={inventory.raw[key]}
                      total={rawTotals[key]}
                      onChange={(field, v) => setCell(resource, 'raw', key, field, v)}
                    />
                    {refinedVisible ? (
                      <QtyCells
                        name={`${recipeLabel(r)} refined`}
                        cell={inventory.refined[key]}
                        total={stockTotals[key]}
                        onChange={(field, v) => setCell(resource, 'refined', key, field, v)}
                      />
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!anyInput ? (
        <div className="rounded border border-border bg-panel p-6 text-center text-sm text-muted">
          Enter how many raw {RESOURCES[resource].label} pieces you have (stacks of {STACK_SIZE} plus loose pieces) to see what is missing and where to sell.
        </div>
      ) : (
        <>
          <RefineTable rows={activeRows} resource={resource} focusMode={focusMode} />
          <SellTable sells={sells} resource={resource} now={now} loading={market.loading} />
        </>
      )}
    </div>
  );
}

function QtyCells({
  name,
  cell,
  total,
  onChange,
}: {
  name: string;
  cell: { stacks: number; units: number } | undefined;
  total: number;
  onChange: (field: 'stacks' | 'units', value: number) => void;
}) {
  const input = (field: 'stacks' | 'units') => (
    <input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      placeholder="0"
      aria-label={`${name} ${field === 'stacks' ? 'stacks' : 'pieces'}`}
      className={`${inputCls.replace('w-full', '')} w-24 text-right`}
      value={cell && cell[field] > 0 ? cell[field] : ''}
      onChange={(e) => onChange(field, e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
  return (
    <>
      <td className="px-2 py-1 text-right">{input('stacks')}</td>
      <td className="px-2 py-1 text-right">{input('units')}</td>
      <td className="px-2 py-1 text-right tabular-nums text-muted" aria-label={`${name} total`}>
        {total > 0 ? fmtSilver(total) : '–'}
      </td>
    </>
  );
}

function Summary({
  plan,
  resource,
  focusMode,
  focusPool,
  label,
  children,
}: {
  plan: ReturnType<typeof planGatherer>;
  resource: Resource;
  focusMode: boolean;
  focusPool: number;
  label: (tier: number, enchant: number) => string;
  children?: ReactNode;
}) {
  const missing = plan.missing;
  const focusOver = focusMode && plan.focusTotal !== null && plan.focusTotal > focusPool;
  return (
    <section className="flex flex-col gap-2 rounded border border-border bg-panel p-3" aria-label="Summary">
      <h2 className="text-sm font-semibold text-accent">Result</h2>
      {missing.length > 0 ? (
        <p className="text-sm" data-testid="missing">
          <strong className="text-warn">Missing, gather and refine:</strong>{' '}
          {missing.map((m, i) => (
            <span key={`${m.tier}.${m.enchant}`}>
              {i > 0 ? ', ' : ''}
              {fmtSilver(m.raw)} × {label(m.tier, m.enchant)}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-sm text-good" data-testid="missing">
          You have enough material to refine everything.
        </p>
      )}
      {plan.topUp.length > 0 ? (
        <p className="text-xs text-muted" data-testid="top-up">
          The highest tier is always refined fully, so its last craft is topped up (included above):{' '}
          {plan.topUp.map((u, i) => (
            <span key={`${u.tier}.${u.enchant}`}>
              {i > 0 ? ', ' : ''}
              {fmtSilver(u.raw)} × {label(u.tier, u.enchant)}
            </span>
          ))}
        </p>
      ) : null}
      {plan.unused.length > 0 ? (
        <p className="text-xs text-muted">
          Not enough for one more craft (left unused):{' '}
          {plan.unused.map((u, i) => (
            <span key={`${u.tier}.${u.enchant}`}>
              {i > 0 ? ', ' : ''}
              {fmtSilver(u.raw)} × {label(u.tier, u.enchant)}
            </span>
          ))}
        </p>
      ) : null}
      {focusMode && plan.focusTotal !== null ? (
        <p className={`text-sm ${focusOver ? 'text-warn' : 'text-text'}`} data-testid="focus-total">
          Focus needed: {fmtSilver(plan.focusTotal)} of {fmtSilver(focusPool)} available
          {focusOver ? ` (${fmtSilver(plan.focusTotal - focusPool)} too much)` : ''}.
        </p>
      ) : null}
      {children}
      <p className="text-xs text-muted">
        Quantities are expected values (resource return is a rate). What is left after each tier has taken its share of {RESOURCES[resource].refinedLabel.toLowerCase()} is listed below for sale.
      </p>
    </section>
  );
}

function RefineTable({
  rows,
  resource,
  focusMode,
}: {
  rows: ReturnType<typeof planGatherer>['rows'];
  resource: Resource;
  focusMode: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded border border-border" aria-label="Refining by tier">
      <h2 className="px-3 pt-3 text-sm font-semibold text-accent">Refining by tier</h2>
      <p className="px-3 pt-1 text-sm" data-testid="refine-city">
        Refine everything in <strong>{BONUS_CITY[resource]}</strong> ({RESOURCES[resource].station}), the city with the +40 % bonus for{' '}
        {RESOURCES[resource].label}. Take the raw materials there.
      </p>
      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 text-left font-medium">Item</th>
              <th className="px-2 py-1 text-right font-medium">Raw you have</th>
              <th className="px-2 py-1 text-right font-medium">Raw to gather</th>
              <th className="px-2 py-1 text-right font-medium">Refined made</th>
              <th className="px-2 py-1 text-right font-medium">Next tier uses</th>
              <th className="px-2 py-1 text-right font-medium">To sell</th>
              {focusMode ? <th className="px-2 py-1 text-right font-medium">Focus</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1 pr-2">{recipeLabel(getRecipe(resource, r.tier, r.enchant))}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtSilver(r.rawHave)}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${r.extraRaw > 0 ? 'font-medium text-warn' : 'text-muted'}`}>
                  {r.extraRaw > 0 ? `+${fmtSilver(r.extraRaw)}` : '–'}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtSilver(r.output)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.demand > 0 ? fmtSilver(r.demand) : '–'}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.sellQty > 0 ? fmtSilver(r.sellQty) : '–'}</td>
                {focusMode ? <td className="px-2 py-1 text-right tabular-nums">{fmtSilver(r.focus)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SellTable({
  sells,
  resource,
  now,
  loading,
}: {
  sells: ReturnType<typeof sellPlan>;
  resource: Resource;
  now: number;
  loading: boolean;
}) {
  return (
    <section className="rounded border border-border" aria-label="Where to sell">
      <h2 className="px-3 pt-3 text-sm font-semibold text-accent">Where to sell</h2>
      {loading ? (
        <p className="p-3 text-sm text-muted">Loading prices…</p>
      ) : sells.length === 0 ? (
        <p className="p-3 text-sm text-muted">Nothing left to sell.</p>
      ) : (
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Item</th>
                <th className="px-2 py-1 text-right font-medium">Quantity</th>
                <th className="px-2 py-1 text-left font-medium">Sell in</th>
                <th className="px-2 py-1 text-right font-medium">Price each</th>
                <th className="px-2 py-1 text-left font-medium">Price age</th>
                <th className="px-2 py-1 text-left font-medium">Other cities</th>
              </tr>
            </thead>
            <tbody>
              {sells.map((s) => (
                <tr key={s.itemId} className="border-t border-border">
                  <td className="py-1 pr-2">{recipeLabel(getRecipe(resource, s.tier, s.enchant))}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmtSilver(s.qty)}</td>
                  {s.best ? (
                    <>
                      <td className="px-2 py-1 font-medium">{s.best.city}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtSilver(s.best.listing)}</td>
                      <td className="px-2 py-1">
                        <AgeBadge ageMs={ageMs(s.best.date, now)} />
                      </td>
                      <td className="px-2 py-1 text-xs text-muted">
                        {s.alternatives
                          .slice(1)
                          .map((a) => `${a.city} ${fmtSilver(a.price)}`)
                          .join(' · ') || '–'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-2 py-1 text-warn">
                      no price data in any city
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Sell with a sell order at the price shown (lowest order in that city minus 1).</p>
        </div>
      )}
    </section>
  );
}
