import { useState } from 'react';
import { RESOURCES } from '@/data/resources';
import type { Resource } from '@/data/types';
import { SPEC_TIERS } from '@/engine/focusEfficiency';
import { useSettings } from '@/state/settings';
import { NumberInput, Segmented } from './fields';

/** Specialization levels: global preset plus per-tier node levels of one refining branch. */
export default function SpecPanel({ resource }: { resource: Resource }) {
  const levels = useSettings((s) => s.spec[resource]);
  const setLevel = useSettings((s) => s.setSpecLevel);
  const applyPreset = useSettings((s) => s.applyPreset);
  const [open, setOpen] = useState(false);

  const values = SPEC_TIERS.map((t) => levels[t]);
  const uniform = values.every((v) => v === values[0]) ? values[0] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Spec preset (all branches)</span>
        <Segmented
          ariaLabel="Spec preset"
          value={uniform === 0 || uniform === 50 || uniform === 100 ? uniform : -1}
          options={[
            { value: 0, label: '0' },
            { value: 50, label: '50' },
            { value: 100, label: '100' },
          ]}
          onChange={applyPreset}
        />
        <button type="button" className="text-xs text-accent underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide' : 'Edit'} {RESOURCES[resource].label} tier nodes
        </button>
      </div>
      {open ? (
        <div className="grid grid-cols-5 gap-2">
          {SPEC_TIERS.map((t) => (
            <label key={t} className="flex flex-col gap-1 text-xs text-muted">
              T{t}
              <NumberInput value={levels[t]} min={0} max={100} step={1} ariaLabel={`T${t} node level`} onChange={(n) => setLevel(resource, t, n)} />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
