import { Fragment, useMemo, useState } from 'react';
import { useMarket } from '@/api/useMarket';
import { recipesFor } from '@/data/recipes';
import { RESOURCES, RESOURCE_LIST } from '@/data/resources';
import { type SortKey, filterOpportunities, findOpportunities, sortOpportunities } from '@/engine/optimize';
import type { Leg, Opportunity } from '@/engine/types';
import { marketRisks } from '@/engine/warnings';
import { useSettings } from '@/state/settings';
import AgeBadge from '../shared/AgeBadge';
import DataBanner from '../shared/DataBanner';
import SpecPanel from '../shared/SpecPanel';
import { Field, NumberInput, Segmented, Toggle, inputCls } from '../shared/fields';
import { fmtNum, fmtPercent, fmtSilver } from '../shared/format';
import { rawLabel, recipeLabel } from '../shared/labels';
import { useNow } from '../shared/useNow';

const AGE_OPTIONS: Array<{ value: string; label: string; hours: number | null }> = [
  { value: '1', label: 'Up to 1 hour', hours: 1 },
  { value: '6', label: 'Up to 6 hours', hours: 6 },
  { value: '24', label: 'Up to 24 hours', hours: 24 },
  { value: '72', label: 'Up to 3 days', hours: 72 },
  { value: 'any', label: 'Any age', hours: null },
];

export default function WizardView() {
  const server = useSettings((s) => s.server);
  const premium = useSettings((s) => s.premium);
  const focusMode = useSettings((s) => s.focusMode);
  const spec = useSettings((s) => s.spec);
  const fee100All = useSettings((s) => s.fee100);
  const setFee100 = useSettings((s) => s.setFee100);
  const wiz = useSettings((s) => s.wizard);
  const patch = useSettings((s) => s.patchWizard);
  const ttl = useSettings((s) => s.cacheTtlMin);
  const openCalculator = useSettings((s) => s.openCalculator);

  const now = useNow();
  const market = useMarket(server, wiz.resource, ttl * 60_000);
  const book = market.result?.book ?? null;
  const [open, setOpen] = useState<string | null>(null);

  const sort: SortKey = wiz.sort === 'spf' && !focusMode ? 'roi' : wiz.sort;

  const rows = useMemo(() => {
    if (!book) return [];
    const all = findOpportunities(recipesFor(wiz.resource), book, {
      budget: wiz.budget,
      focusMode,
      spec: spec[wiz.resource],
      premium,
      fee100: fee100All[wiz.resource],
      focusPool: wiz.focusPool,
      now,
    });
    const filtered = filterOpportunities(all, {
      minRoi: wiz.minRoi,
      maxAgeMs: wiz.maxAgeHours === null ? null : wiz.maxAgeHours * 3_600_000,
      hideRisky: wiz.hideRisky,
    });
    return sortOpportunities(filtered, sort);
  }, [book, wiz, focusMode, spec, premium, fee100All, now, sort]);

  const ageValue = wiz.maxAgeHours === null ? 'any' : String(wiz.maxAgeHours);

  return (
    <div className="flex flex-col gap-4">
      <DataBanner market={market} />

      <section className="grid gap-3 rounded border border-border bg-panel p-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filters">
        <Field label="Resource (loads only this type)">
          <select
            className={inputCls}
            value={wiz.resource}
            onChange={(e) => {
              patch({ resource: e.target.value as typeof wiz.resource });
              setOpen(null);
            }}
          >
            {RESOURCE_LIST.map((r) => (
              <option key={r} value={r}>
                {RESOURCES[r].label} → {RESOURCES[r].refinedLabel}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Budget (silver)">
          <NumberInput value={wiz.budget} min={0} step={10000} ariaLabel="Budget" onChange={(n) => patch({ budget: n })} />
        </Field>
        <Field label="Minimum ROI %">
          <NumberInput value={wiz.minRoi} step={1} ariaLabel="Minimum ROI" onChange={(n) => patch({ minRoi: n })} />
        </Field>
        <Field label="Maximum price age">
          <select
            className={inputCls}
            value={ageValue}
            aria-label="Maximum price age"
            onChange={(e) => patch({ maxAgeHours: AGE_OPTIONS.find((o) => o.value === e.target.value)?.hours ?? null })}
          >
            {AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Fee per 100 nutrition (${RESOURCES[wiz.resource].station})`} hint="Shown at the station">
          <NumberInput value={fee100All[wiz.resource]} min={0} ariaLabel="Fee per 100 nutrition" onChange={(n) => setFee100(wiz.resource, n)} />
        </Field>
        {focusMode ? (
          <Field label="Available Focus" hint="Limits how many crafts fit">
            <NumberInput value={wiz.focusPool} min={0} step={1000} ariaLabel="Available Focus" onChange={(n) => patch({ focusPool: n })} />
          </Field>
        ) : null}
        <div className="flex flex-col gap-1 text-xs text-muted">
          Sort by
          <Segmented
            ariaLabel="Sort by"
            value={sort}
            options={[
              { value: 'roi', label: 'ROI %' },
              ...(focusMode ? [{ value: 'spf' as const, label: 'SPF' }] : []),
              { value: 'profit', label: 'Net profit' },
            ]}
            onChange={(v) => patch({ sort: v })}
          />
        </div>
        <div className="flex items-end sm:col-span-2">
          <Toggle
            checked={wiz.hideRisky}
            onChange={(v) => patch({ hideRisky: v })}
            label="Hide results with thin-market warnings"
          />
        </div>
        {focusMode ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <SpecPanel resource={wiz.resource} />
          </div>
        ) : null}
      </section>

      <ResultsTable
        rows={rows}
        focusMode={focusMode}
        loading={market.loading}
        open={open}
        onToggle={(id) => setOpen((o) => (o === id ? null : id))}
        onOpenCalculator={(o) =>
          openCalculator({
            resource: o.recipe.resource,
            tier: o.recipe.tier,
            enchant: o.recipe.enchant,
            rawCity: o.route.rawCity,
            lowerCity: o.route.lowerCity,
            sellCity: o.route.sellCity,
            sets: o.sets,
          })
        }
      />
      <p className="text-xs text-muted">
        Prices are the lowest sell orders from the Albion Data Project; order depth is not known, so large budgets may not be filled at these prices.
      </p>
    </div>
  );
}

function ResultsTable({
  rows,
  focusMode,
  loading,
  open,
  onToggle,
  onOpenCalculator,
}: {
  rows: Opportunity[];
  focusMode: boolean;
  loading: boolean;
  open: string | null;
  onToggle: (id: string) => void;
  onOpenCalculator: (o: Opportunity) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading results">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-panel" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded border border-border bg-panel p-6 text-center text-sm text-muted">
        No opportunities match these filters. Try a lower minimum ROI, a larger budget, older prices allowed, or another resource.
      </div>
    );
  }

  const cols = focusMode ? 8 : 6;
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-panel text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Route</th>
            <th className="px-3 py-2 text-right font-medium">Net profit</th>
            <th className="px-3 py-2 text-right font-medium">ROI</th>
            {focusMode ? <th className="px-3 py-2 text-right font-medium">SPF</th> : null}
            {focusMode ? <th className="px-3 py-2 text-right font-medium">Marginal SPF</th> : null}
            <th className="px-3 py-2 font-medium">Data age</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const id = o.recipe.refinedId;
            const expanded = open === id;
            return (
              <Fragment key={id}>
                <tr className="border-t border-border bg-bg hover:bg-panel">
                  <td className="px-3 py-2 font-medium">
                    {recipeLabel(o.recipe)}
                    <RiskMark o={o} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {o.route.rawCity}
                    {o.route.lowerCity && o.route.lowerCity !== o.route.rawCity ? ` + ${o.route.lowerCity}` : ''} → {o.route.refineCity} → {o.route.sellCity}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-good">{fmtSilver(o.result.netProfit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPercent(o.result.roi)}</td>
                  {focusMode ? <td className="px-3 py-2 text-right tabular-nums">{fmtNum(o.result.spf, 1)}</td> : null}
                  {focusMode ? <td className="px-3 py-2 text-right tabular-nums">{fmtNum(o.result.marginalSpf, 1)}</td> : null}
                  <td className="px-3 py-2">
                    <AgeBadge ageMs={o.oldestAgeMs} title="Age of the oldest price used" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Hide' : 'Show'} plan for ${recipeLabel(o.recipe)}`}
                      onClick={() => onToggle(id)}
                      className="rounded border border-border bg-panel-2 px-2 py-1 text-xs hover:border-accent"
                    >
                      {expanded ? 'Hide plan' : 'Plan'}
                    </button>
                  </td>
                </tr>
                {expanded ? (
                  <tr className="border-t border-border bg-panel">
                    <td colSpan={cols + 0} className="px-4 py-3">
                      <ActionPlan o={o} focusMode={focusMode} onOpenCalculator={() => onOpenCalculator(o)} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Warning sign next to an item whose prices look too good to fill in full. */
function RiskMark({ o }: { o: Opportunity }) {
  const risks = marketRisks(o);
  if (risks.length === 0) return null;
  return (
    <span
      role="img"
      aria-label="Thin-market warning"
      title={risks.map((r) => r.message).join('\n')}
      className="ml-2 cursor-help text-warn"
    >
      ⚠
    </span>
  );
}

function Legs({ title, legs }: { title: string; legs: Leg[] }) {
  if (legs.length === 0) return null;
  return (
    <div className="text-xs text-muted">
      <span className="text-text">{title}: </span>
      {legs.map((l, i) => (
        <span key={l.city}>
          {i > 0 ? ' · ' : ''}
          {l.city} {fmtSilver(l.price)}
        </span>
      ))}
    </div>
  );
}

function ActionPlan({ o, focusMode, onOpenCalculator }: { o: Opportunity; focusMode: boolean; onOpenCalculator: () => void }) {
  const { recipe, route, result } = o;
  const info = RESOURCES[recipe.resource];
  const sameBuyCity = route.lowerCity === route.rawCity;
  const risks = marketRisks(o);
  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>
          <strong>Buy</strong> {fmtSilver(result.rawUnits)} × {rawLabel(recipe)} in {route.rawCity} at about {fmtSilver(o.rawPrice)} each
          ({fmtSilver(result.rawCost)} silver)
          {recipe.lowerRefinedId && route.lowerCity ? (
            <>
              {' '}
              and {fmtSilver(result.lowerUnits)} × lower-tier {info.refinedLabel} in {sameBuyCity ? 'the same city' : route.lowerCity} at about{' '}
              {fmtSilver(o.lowerPrice)} each ({fmtSilver(result.lowerCost)} silver)
            </>
          ) : null}
          .
        </li>
        <li>
          <strong>Refine</strong> in {route.refineCity} ({info.station}). Expected {fmtNum(result.crafts, 1)} × {recipeLabel(recipe)} (
          {fmtSilver(result.outputFloor)} guaranteed); station fees about {fmtSilver(result.stationCost)} silver
          {focusMode ? `, Focus spent ${fmtSilver(result.focusTotal)}` : ''}.
        </li>
        <li>
          <strong>Sell</strong> in {route.sellCity} with a sell order at {fmtSilver(o.sellPrice)} each (lowest order − 1).
        </li>
        <li>
          <strong>Result:</strong> net profit {fmtSilver(result.netProfit)} silver, ROI {fmtPercent(result.roi)}
          {focusMode ? `, ${fmtNum(result.spf, 1)} silver per Focus (${fmtNum(result.marginalSpf, 1)} gained from Focus per Focus)` : ''}.
        </li>
      </ol>
      {risks.length > 0 ? (
        <div className="rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn" role="note" aria-label="Thin-market warnings">
          <p className="mb-1 font-medium">Check the market before you buy:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {risks.map((r) => (
              <li key={r.kind}>{r.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-1 sm:grid-cols-3">
        <Legs title="Cheapest raw" legs={o.alternatives.raw} />
        <Legs title="Cheapest lower tier" legs={o.alternatives.lower} />
        <Legs title="Best sell" legs={o.alternatives.sell} />
      </div>
      <div>
        <button
          type="button"
          onClick={onOpenCalculator}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:opacity-90"
        >
          Open in calculator
        </button>
      </div>
    </div>
  );
}
