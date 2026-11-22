import {
  BACKPACK_NAME,
  BACKPACK_TIERS,
  BAG_TIERS,
  OX_TIERS,
  QUALITIES,
  QUALITY_LABEL,
  type Quality,
  bagEnchants,
} from '@/data/carry';
import type { Resource } from '@/data/types';
import { type CarrySetup, capacityBreakdown, checkTrip, loadKg, type TripCheck } from '@/engine/carry';
import type { GatherPlan } from '@/engine/gatherer';
import { useSettings } from '@/state/settings';
import { Field, NumberInput, Toggle, inputCls } from '../shared/fields';
import { fmtNum } from '../shared/format';

const kg = (n: number): string => `${fmtNum(n, n >= 100 ? 0 : 1)} kg`;

/** Ox, bag, base capacity and backpack: what you carry the material with. */
export function TransportPanel({ resource }: { resource: Resource }) {
  const carry = useSettings((s) => s.carry);
  const setCarry = useSettings((s) => s.setCarry);
  const cap = capacityBreakdown(carry);
  const enchants = bagEnchants(carry.bagTier);
  const enchant = enchants.includes(carry.bagEnchant) ? carry.bagEnchant : 0;

  const qualitySelect = (value: Quality, label: string, onChange: (q: Quality) => void) => (
    <Field label={`${label} quality`}>
      <select className={inputCls} value={value} aria-label={`${label} quality`} onChange={(e) => onChange(e.target.value as Quality)}>
        {QUALITIES.map((q) => (
          <option key={q} value={q}>
            {QUALITY_LABEL[q]}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <section className="flex flex-col gap-3 rounded border border-border bg-panel p-3" aria-label="Transport">
      <h2 className="text-sm font-semibold text-accent">Transport</h2>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Ox tier">
          <select className={inputCls} value={carry.oxTier} aria-label="Ox tier" onChange={(e) => setCarry({ oxTier: Number(e.target.value) })}>
            <option value={0}>No ox</option>
            {OX_TIERS.map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </select>
        </Field>
        {carry.oxTier > 0 ? qualitySelect(carry.oxQuality, 'Ox', (q) => setCarry({ oxQuality: q })) : <div className="hidden lg:block" />}

        <Field label="Bag tier">
          <select className={inputCls} value={carry.bagTier} aria-label="Bag tier" onChange={(e) => setCarry({ bagTier: Number(e.target.value) })}>
            <option value={0}>No bag</option>
            {BAG_TIERS.map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </select>
        </Field>
        {carry.bagTier > 0 ? (
          <>
            <Field label="Bag enchant">
              <select
                className={inputCls}
                value={enchant}
                aria-label="Bag enchant"
                disabled={enchants.length === 1}
                onChange={(e) => setCarry({ bagEnchant: Number(e.target.value) })}
              >
                {enchants.map((e) => (
                  <option key={e} value={e}>
                    .{e}
                  </option>
                ))}
              </select>
            </Field>
            {qualitySelect(carry.bagQuality, 'Bag', (q) => setCarry({ bagQuality: q }))}
          </>
        ) : null}

        <Field label="Base capacity (kg)" hint="Character without bag and ox">
          <NumberInput value={carry.baseKg} min={0} step={10} ariaLabel="Base capacity" onChange={(n) => setCarry({ baseKg: n })} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Toggle
          checked={carry.backpack}
          onChange={(v) => setCarry({ backpack: v })}
          label={`${BACKPACK_NAME[resource]} backpack instead of cape (−30 % weight of this resource)`}
        />
        {carry.backpack ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            Backpack tier
            <select
              className={`${inputCls.replace('w-full', '')} w-24`}
              value={carry.backpackTier}
              aria-label="Backpack tier"
              onChange={(e) => setCarry({ backpackTier: Number(e.target.value) })}
            >
              {BACKPACK_TIERS.map((t) => (
                <option key={t} value={t}>
                  T{t}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p className="text-xs text-muted" data-testid="capacity">
        Usable capacity <strong className="text-text">{kg(cap.usable)}</strong>: ox {kg(cap.ox)} + bag {kg(cap.bag)} + base {kg(cap.base)} −
        weight of ox, bag and backpack {kg(cap.gear)}.
      </p>
    </section>
  );
}

function describeTrip(t: TripCheck): { text: string; tone: string } {
  switch (t.status) {
    case 'empty':
      return { text: 'Nothing to carry.', tone: 'text-muted' };
    case 'no-capacity':
      return { text: `${kg(t.loadKg)} to carry, but there is no capacity: set an ox, a bag or a base capacity above.`, tone: 'text-warn' };
    case 'fits':
      return { text: `Fits: ${kg(t.loadKg)} of ${kg(t.usableKg)} usable (${fmtNum(t.fillPercent, 0)} %).`, tone: 'text-good' };
    case 'over':
      return {
        text: `Does not fit: ${kg(t.loadKg)} vs ${kg(t.usableKg)} usable, ${kg(t.overKg)} over; ${t.trips} trips needed.`,
        tone: 'text-bad',
      };
  }
}

/** Do the entered materials fit on the way to the refining city and the refined items on the way to sell them? */
export function TransportResult({ plan, resource, city }: { plan: GatherPlan; resource: Resource; city: string }) {
  const carry: CarrySetup = useSettings((s) => s.carry);
  const cap = capacityBreakdown(carry);
  const bp = carry.backpack ? carry.backpackTier : null;

  const toRefine = loadKg(plan.rows.map((r) => ({ tier: r.tier, qty: r.rawHave + r.extraRaw + r.stock })), bp);
  const haveOnly = loadKg(plan.rows.map((r) => ({ tier: r.tier, qty: r.rawHave + r.stock })), bp);
  const toSell = loadKg(plan.rows.map((r) => ({ tier: r.tier, qty: r.sellQty })), bp);
  const trip1 = describeTrip(checkTrip(toRefine, cap.usable));
  const trip2 = describeTrip(checkTrip(toSell, cap.usable));
  const gatheringMore = plan.missing.length > 0;

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-panel-2 p-2" aria-label={`Transport check for ${resource}`}>
      <p className="text-xs font-medium text-text">Transport</p>
      <p className="text-sm" data-testid="trip-refine">
        <span className="text-muted">To {city} to refine: </span>
        <span className={trip1.tone}>{trip1.text}</span>
        {gatheringMore ? <span className="text-xs text-muted"> Includes the raw still to gather; what you have now weighs {kg(haveOnly)}.</span> : null}
      </p>
      <p className="text-sm" data-testid="trip-sell">
        <span className="text-muted">Refined items to sell: </span>
        <span className={trip2.tone}>{trip2.text}</span>
      </p>
    </div>
  );
}
