import type { Server } from '@/data/types';
import { useSettings } from '@/state/settings';
import { Segmented, Toggle } from '../shared/fields';

const SERVERS: Array<{ value: Server; label: string }> = [
  { value: 'europe', label: 'Europe' },
  { value: 'americas', label: 'Americas' },
  { value: 'asia', label: 'Asia' },
];

export default function TopBar() {
  const server = useSettings((s) => s.server);
  const setServer = useSettings((s) => s.setServer);
  const premium = useSettings((s) => s.premium);
  const setPremium = useSettings((s) => s.setPremium);
  const focusMode = useSettings((s) => s.focusMode);
  const setFocusMode = useSettings((s) => s.setFocusMode);
  const view = useSettings((s) => s.view);
  const setView = useSettings((s) => s.setView);

  return (
    <header className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <h1 className="text-lg font-semibold text-accent">Albion Refining</h1>
        <nav aria-label="Views">
          <Segmented
            ariaLabel="View"
            value={view}
            options={[
              { value: 'wizard', label: 'Wizard' },
              { value: 'calculator', label: 'Calculator' },
              { value: 'gatherer', label: 'Gatherer' },
            ]}
            onChange={setView}
          />
        </nav>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto">
          <Segmented ariaLabel="Server" value={server} options={SERVERS} onChange={setServer} />
          <Segmented
            ariaLabel="Focus mode"
            value={focusMode ? 'focus' : 'none'}
            options={[
              { value: 'none', label: 'No Focus' },
              { value: 'focus', label: 'With Focus' },
            ]}
            onChange={(v) => setFocusMode(v === 'focus')}
          />
          <Toggle checked={premium} onChange={setPremium} label="Premium" />
        </div>
      </div>
    </header>
  );
}
