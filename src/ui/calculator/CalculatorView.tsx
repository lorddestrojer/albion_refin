import { type ReactNode, useMemo, useState } from 'react';
import { useMarket } from '@/api/useMarket';
import { BONUS_CITY, CITIES } from '@/data/cities';
import { getRecipe } from '@/data/recipes';
import { RESOURCES, RESOURCE_LIST, TIERS, availableEnchants } from '@/data/resources';
import type { City, Enchant, Resource, Tier } from '@/data/types';
import { ageMs } from '@/engine/age';
import { legsAscending } from '@/engine/optimize';
import type { Leg } from '@/engine/types';
import { type CalcSeed, useSettings } from '@/state/settings';
import AgeBadge from '../shared/AgeBadge';
import DataBanner from '../shared/DataBanner';
import SpecPanel from '../shared/SpecPanel';
import { Field, NumberInput, inputCls } from '../shared/fields';
import { fmtNum, fmtPercent, fmtSilver } from '../shared/format';
import { useNow } from '../shared/useNow';
import { type Overrides, deriveCalc } from './model';

const NO_CITY = '';

function legFor(book: Record<string, Partial<Record<City, { price: number; date: string | null }>>>, id: string | null, city: City | null): Leg | null {
  if (!id || !city) return null;
  const p = book[id]?.[city];
  return p && p.price > 0 ? { city, price: p.price, date: p.date } : null;
}

/** Entry point: remounts the inner calculator whenever a new recipe is handed over from the Wizard. */
export default function CalculatorView() {
  const seed = useSettings((s) => s.seed);
  return <CalculatorInner key={seed ? JSON.stringify(seed) : 'manual'} seed={seed} />;
}

function CalculatorInner({ seed }: { seed: CalcSeed | null }) {
  const server = useSettings((s) => s.server);
  const premium = useSettings((s) => s.premium);
  const focusMode = useSettings((s) => s.focusMode);
  const spec = useSettings((s) => s.spec);
  const fee100All = useSettings((s) => s.fee100);
  const setFee100 = useSettings((s) => s.setFee100);
  const budget = useSettings((s) => s.wizard.budget);
  const ttl = useSettings((s) => s.cacheTtlMin);

  const [resource, setResource] = useState<Resource>(seed?.resource ?? 'wood');
  const [tier, setTier] = useState<Tier>(seed?.tier ?? 4);
  const [enchant, setEnchant] = useState<Enchant>(seed?.enchant ?? 0);
  const [rawCity, setRawCity] = useState<City | null | undefined>(seed?.rawCity);
  const [lowerCity, setLowerCity] = useState<City | null | undefined>(seed?.lowerCity ?? undefined);
  const [sellCity, setSellCity] = useState<City | null | undefined>(seed?.sellCity);
  const [overrides, setOverrides] = useState<Overrides>(seed?.sets ? { sets: seed.sets } : {});

  const now = useNow();
  const market = useMarket(server, resource, ttl * 60_000);
  const book = market.result?.book ?? {};
  const recipe = useMemo(() => getRecipe(resource, tier, enchant), [resource, tier, enchant]);
  const enchants = availableEnchants(resource, tier);

  // Cities: explicit pick if any, otherwise the cheapest raw/lower and the best sell city.
  const rawLegs = legsAscending(book, recipe.rawId);
  const lowerLegs = recipe.lowerRefinedId ? legsAscending(book, recipe.lowerRefinedId) : [];
  const sellLegs = legsAscending(book, recipe.refinedId).reverse();
  const rawLeg = rawCity === undefined ? (rawLegs[0] ?? null) : legFor(book, recipe.rawId, rawCity);
  const lowerLeg = recipe.lowerRefinedId
    ? lowerCity === undefined
      ? (lowerLegs[0] ?? null)
      : legFor(book, recipe.lowerRefinedId, lowerCity)
    : null;
  const sellLeg = sellCity === undefined ? (sellLegs[0] ?? null) : legFor(book, recipe.refinedId, sellCity);

  const fee100 = fee100All[resource];
  const derived = useMemo(
    () =>
      deriveCalc({
        recipe,
        api: { raw: rawLeg, lower: lowerLeg, sell: sellLeg },
        overrides,
        premium,
        focusMode,
        spec: spec[resource],
        fee100,
        budget,
      }),
    [recipe, rawLeg, lowerLeg, sellLeg, overrides, premium, focusMode, spec, resource, fee100, budget],
  );
  const { values, defaults, result } = derived;

  const set = (key: keyof Overrides) => (n: number) => setOverrides((o) => ({ ...o, [key]: n }));
  const reset = (key: keyof Overrides) => () =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });

  const changeResource = (r: Resource) => {
    setResource(r);
    setRawCity(undefined);
    setLowerCity(undefined);
    setSellCity(undefined);
    setOverrides({});
    if (r === 'stone') setEnchant(0);
  };
  const changeRecipe = (t: Tier, e: Enchant) => {
    setTier(t);
    setEnchant(availableEnchants(resource, t).includes(e) ? e : 0);
    setOverrides({});
  };
  const changeCity = (apply: (c: City | null | undefined) => void) => (v: string) => {
    apply(v === NO_CITY ? null : (v as City));
    setOverrides((o) => ({ ...o, rawPrice: undefined, lowerPrice: undefined, sellPrice: undefined }));
  };

  const profitCls = result.netProfit >= 0 ? 'text-good' : 'text-bad';

  return (
    <div className="flex flex-col gap-4">
      <DataBanner market={market} />

      <section className="grid gap-3 rounded border border-border bg-panel p-3 sm:grid-cols-4" aria-label="Recipe">
        <Field label="Resource">
          <select className={inputCls} value={resource} onChange={(e) => changeResource(e.target.value as Resource)}>
            {RESOURCE_LIST.map((r) => (
              <option key={r} value={r}>
                {RESOURCES[r].label} → {RESOURCES[r].refinedLabel}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tier">
          <select className={inputCls} value={tier} onChange={(e) => changeRecipe(Number(e.target.value) as Tier, enchant)}>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Enchant">
          <select className={inputCls} value={enchant} onChange={(e) => changeRecipe(tier, Number(e.target.value) as Enchant)}>
            {enchants.map((e) => (
              <option key={e} value={e}>
                .{e}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col justify-end text-xs text-muted">
          Refine in <span className="text-sm text-text">{BONUS_CITY[resource]}</span> ({RESOURCES[resource].station})
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded border border-border bg-panel p-3" aria-label="Inputs">
          <h2 className="text-sm font-semibold text-accent">Prices and settings</h2>

          <CityPrice
            label={`Raw ${RESOURCES[resource].label} (×${recipe.rawQty} per craft)`}
            legs={rawLegs}
            selected={rawLeg?.city ?? null}
            onCity={changeCity(setRawCity)}
            now={now}
            value={values.rawPrice}
            apiValue={defaults.rawPrice}
            overridden={overrides.rawPrice !== undefined}
            onChange={set('rawPrice')}
            onReset={reset('rawPrice')}
            leg={rawLeg}
          />
          {recipe.lowerRefinedId ? (
            <CityPrice
              label={`Lower-tier ${RESOURCES[resource].refinedLabel} (×1 per craft)`}
              legs={lowerLegs}
              selected={lowerLeg?.city ?? null}
              onCity={changeCity(setLowerCity)}
              now={now}
              value={values.lowerPrice}
              apiValue={defaults.lowerPrice}
              overridden={overrides.lowerPrice !== undefined}
              onChange={set('lowerPrice')}
              onReset={reset('lowerPrice')}
              leg={lowerLeg}
            />
          ) : null}
          <CityPrice
            label="Sell price (lowest sell order − 1)"
            legs={sellLegs}
            selected={sellLeg?.city ?? null}
            onCity={changeCity(setSellCity)}
            now={now}
            value={values.sellPrice}
            apiValue={defaults.sellPrice}
            overridden={overrides.sellPrice !== undefined}
            onChange={set('sellPrice')}
            onReset={reset('sellPrice')}
            leg={sellLeg}
          />

          <div className="grid grid-cols-2 gap-3">
            <Override
              label="Fee per 100 nutrition"
              hint="Shown at the station. Saved per resource."
              value={fee100}
              onChange={(n) => setFee100(resource, n)}
            />
            <Override
              label="Station fee per craft"
              hint={`From fee per 100 nutrition: ${fmtNum(defaults.feePerCraft, 2)}`}
              value={values.feePerCraft}
              overridden={overrides.feePerCraft !== undefined}
              onChange={set('feePerCraft')}
              onReset={reset('feePerCraft')}
              step={0.01}
            />
            <Override
              label="RRR %"
              hint={`Default ${fmtNum(defaults.rrrPercent)} % (${focusMode ? 'with' : 'without'} Focus)`}
              value={values.rrrPercent}
              overridden={overrides.rrrPercent !== undefined}
              onChange={set('rrrPercent')}
              onReset={reset('rrrPercent')}
              step={0.1}
            />
            <Override
              label="Purchase sets"
              hint={`Fits the wizard budget: ${fmtSilver(defaults.sets)}`}
              value={values.sets}
              overridden={overrides.sets !== undefined}
              onChange={set('sets')}
              onReset={reset('sets')}
            />
            {focusMode ? (
              <Override
                label="Focus per craft"
                hint={`From spec: ${fmtNum(defaults.focusPerCraft, 2)}`}
                value={values.focusPerCraft ?? 0}
                overridden={overrides.focusPerCraft !== undefined}
                onChange={set('focusPerCraft')}
                onReset={reset('focusPerCraft')}
                step={0.1}
              />
            ) : null}
          </div>

          {focusMode ? <SpecPanel resource={resource} /> : <p className="text-xs text-muted">Turn on Focus in the top bar to include Focus, spec levels and SPF.</p>}
        </section>

        <section className="flex flex-col gap-3 rounded border border-border bg-panel p-3" aria-label="Results">
          <h2 className="text-sm font-semibold text-accent">Result</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <Row label="Buy raw" value={`${fmtSilver(result.rawUnits)} × ${fmtSilver(values.rawPrice)}`} hint={rawLeg?.city} />
            {recipe.lowerRefinedId ? (
              <Row label={`Buy lower ${RESOURCES[resource].refinedLabel}`} value={`${fmtSilver(result.lowerUnits)} × ${fmtSilver(values.lowerPrice)}`} hint={lowerLeg?.city} />
            ) : null}
            <Row label="Purchase cost" value={fmtSilver(result.buyCost)} />
            <Row label="Station fees" value={fmtSilver(result.stationCost)} />
            <Row label="Total invested" value={fmtSilver(result.invested)} strong />
            <Row label="Items produced (expected)" value={fmtNum(result.crafts, 1)} hint={`${fmtSilver(result.outputFloor)} guaranteed`} />
            <Row label={`Revenue after tax (${fmtPercent(premium ? 4 : 8, 0)} + 2.5 % setup)`} value={fmtSilver(result.revenue)} />
            <Row label="Net profit" value={fmtSilver(result.netProfit)} strong valueCls={profitCls} testId="net-profit" />
            <Row label="ROI" value={fmtPercent(result.roi)} strong valueCls={profitCls} testId="roi" />
            <Row label="Break-even sell price" value={fmtSilver(result.breakEvenSell)} />
            {focusMode ? (
              <>
                <Row label="Focus spent" value={fmtSilver(result.focusTotal)} />
                <Row label="Silver per Focus (SPF)" value={fmtNum(result.spf, 1)} strong testId="spf" />
                <Row label="Marginal SPF (gain from Focus per Focus)" value={fmtNum(result.marginalSpf, 1)} testId="marginal-spf" />
              </>
            ) : null}
          </dl>
          {result.crafts === 0 ? <p className="text-xs text-warn">Nothing to calculate yet: enter prices or choose cities with data.</p> : null}
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  strong,
  valueCls,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  valueCls?: string;
  testId?: string;
}) {
  return (
    <>
      <dt className={strong ? 'font-medium text-text' : 'text-muted'}>
        {label}
        {hint ? <span className="ml-2 text-xs text-muted">{hint}</span> : null}
      </dt>
      <dd data-testid={testId} className={`text-right tabular-nums ${strong ? 'font-semibold' : ''} ${valueCls ?? 'text-text'}`}>
        {value}
      </dd>
    </>
  );
}

function Override({
  label,
  hint,
  value,
  overridden,
  onChange,
  onReset,
  step,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  overridden?: boolean;
  onChange: (n: number) => void;
  onReset?: () => void;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {onReset ? (
          overridden ? (
            <button type="button" onClick={onReset} className="text-accent underline">
              reset to default
            </button>
          ) : (
            <span className="text-[11px]">auto</span>
          )
        ) : null}
      </div>
      <NumberInput value={value} onChange={onChange} min={0} step={step} ariaLabel={label} />
      {hint ? <span className="text-[11px]">{hint}</span> : null}
    </div>
  );
}

function CityPrice({
  label,
  legs,
  selected,
  onCity,
  now,
  value,
  apiValue,
  overridden,
  onChange,
  onReset,
  leg,
}: {
  label: string;
  legs: Leg[];
  selected: City | null;
  onCity: (v: string) => void;
  now: number;
  value: number;
  apiValue: number;
  overridden: boolean;
  onChange: (n: number) => void;
  onReset: () => void;
  leg: Leg | null;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-3">
      <Field label={`${label}: city`}>
        <select className={inputCls} value={selected ?? NO_CITY} onChange={(e) => onCity(e.target.value)} aria-label={`${label} city`}>
          <option value={NO_CITY}>— none / no data —</option>
          {CITIES.map((c) => {
            const l = legs.find((x) => x.city === c);
            return (
              <option key={c} value={c} disabled={!l}>
                {c} {l ? `(${fmtSilver(l.price)})` : '(no data)'}
              </option>
            );
          })}
        </select>
      </Field>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <div className="flex items-center justify-between">
          <span>Price</span>
          {overridden ? (
            <button type="button" onClick={onReset} className="text-accent underline">
              reset to API ({fmtSilver(apiValue)})
            </button>
          ) : leg ? (
            <AgeBadge ageMs={ageMs(leg.date, now)} />
          ) : (
            <span className="text-[11px]">no API price</span>
          )}
        </div>
        <NumberInput value={value} onChange={onChange} min={0} ariaLabel={`${label} price`} />
      </div>
    </div>
  );
}
