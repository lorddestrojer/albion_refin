import { useSettings } from '@/state/settings';
import CalculatorView from '@/ui/calculator/CalculatorView';
import GathererView from '@/ui/gatherer/GathererView';
import TopBar from '@/ui/layout/TopBar';
import WizardView from '@/ui/wizard/WizardView';

export default function App() {
  const view = useSettings((s) => s.view);
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-4">
        {view === 'wizard' ? <WizardView /> : view === 'calculator' ? <CalculatorView /> : <GathererView />}
      </main>
    </div>
  );
}
