import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '@/state/settings';
import App from '@/App';
import CalculatorView from './calculator/CalculatorView';
import { deriveCalc } from './calculator/model';
import { getRecipe } from '@/data/recipes';
import { uniformSpec } from '@/engine/focusEfficiency';
import { stockKey } from '@/engine/gatherer';
import WizardView from './wizard/WizardView';
import GathererView from './gatherer/GathererView';
import { ageLevel, fmtAge } from './shared/format';

vi.mock('@/api/market', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/market')>();
  const stamp = () => new Date(Date.now() - 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, '');
  return {
    ...original,
    loadMarket: vi.fn(async () => ({
      book: {
        T4_WOOD: { Martlock: { price: 80, date: stamp() }, Thetford: { price: 120, date: stamp() } },
        T3_PLANKS: { Lymhurst: { price: 200, date: stamp() } },
        T4_PLANKS: { Brecilien: { price: 700, date: stamp() }, 'Fort Sterling': { price: 500, date: stamp() } },
      },
      fetchedAt: Date.now(),
      source: 'live',
      warning: null,
    })),
  };
});

beforeEach(() => {
  localStorage.clear();
  useSettings.setState(useSettings.getInitialState(), true);
});

describe('format helpers', () => {
  it('colours ages by threshold', () => {
    expect(ageLevel(30 * 60_000)).toBe('fresh');
    expect(ageLevel(3 * 3_600_000)).toBe('aging');
    expect(ageLevel(10 * 3_600_000)).toBe('old');
    expect(ageLevel(null)).toBe('unknown');
    expect(fmtAge(null)).toBe('unknown');
    expect(fmtAge(5 * 60_000)).toBe('5 min');
    expect(fmtAge(5 * 3_600_000)).toBe('5 h');
  });
});

describe('deriveCalc', () => {
  const base = {
    recipe: getRecipe('wood', 4, 0),
    api: {
      raw: { city: 'Martlock' as const, price: 80, date: null },
      lower: { city: 'Lymhurst' as const, price: 200, date: null },
      sell: { city: 'Brecilien' as const, price: 700, date: null },
    },
    overrides: {},
    premium: true,
    focusMode: false,
    spec: uniformSpec(0),
    fee100: 315,
    budget: 36_000,
  };
  it('uses API prices, sell price minus one, and the budget for sets', () => {
    const d = deriveCalc(base);
    expect(d.values.sellPrice).toBe(699);
    expect(d.values.sets).toBe(100);
    expect(d.input.rrr).toBeCloseTo(0.367, 10);
  });
  it('overrides win and recalculate', () => {
    const a = deriveCalc(base).result.netProfit;
    const b = deriveCalc({ ...base, overrides: { sellPrice: 1000 } }).result.netProfit;
    expect(b).toBeGreaterThan(a);
    expect(deriveCalc({ ...base, overrides: { rrrPercent: 0 } }).result.crafts).toBe(100);
  });
  it('focus mode switches RRR and fills SPF', () => {
    const d = deriveCalc({ ...base, focusMode: true, spec: uniformSpec(100) });
    expect(d.input.rrr).toBeCloseTo(0.539, 10);
    expect(d.values.focusPerCraft).toBeCloseTo(54 / 16, 6);
    expect(d.result.spf).not.toBeNull();
  });
});

describe('Calculator', () => {
  it('prefills from API data and recalculates instantly when a price is overridden', async () => {
    render(<CalculatorView />);
    const net = await screen.findByTestId('net-profit');
    await waitFor(() => expect(net.textContent).not.toBe('–'));
    expect(net).toHaveClass('text-good');

    const sell = screen.getByLabelText(/sell price.*price$/i) as HTMLInputElement;
    expect(sell.value).toBe('699');

    fireEvent.change(sell, { target: { value: '100' } });
    expect(screen.getByTestId('net-profit')).toHaveClass('text-bad');
    expect(screen.getByTestId('roi').textContent).toMatch(/-/);

    await userEvent.click(screen.getByRole('button', { name: /reset to API \(699\)/i }));
    expect((screen.getByLabelText(/sell price.*price$/i) as HTMLInputElement).value).toBe('699');
    expect(screen.getByTestId('net-profit')).toHaveClass('text-good');
  });

  it('shows Focus outputs only in Focus mode', async () => {
    useSettings.setState({ focusMode: true });
    render(<CalculatorView />);
    expect(await screen.findByTestId('spf')).toBeInTheDocument();
    expect(screen.getByTestId('marginal-spf')).toBeInTheDocument();
  });
});

describe('Gatherer', () => {
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('shows an empty state until something is entered', () => {
    render(<GathererView />);
    expect(screen.getByText(/Enter how many raw Wood pieces/)).toBeInTheDocument();
  });

  it('turns stacks and pieces into a total: 3 stacks + 45 pieces = 3,042', () => {
    render(<GathererView />);
    type('T2 Wood raw stacks', '3');
    type('T2 Wood raw pieces', '45');
    expect(screen.getByLabelText('T2 Wood raw total')).toHaveTextContent('3,042');
  });

  describe('collapsible enchants', () => {
    it('hides .1–.4 of T4–T8 by default but keeps T2, T3 and the .0 rows', () => {
      render(<GathererView />);
      expect(screen.getByLabelText('T2 Wood raw stacks')).toBeInTheDocument();
      expect(screen.getByLabelText('T3 Wood raw stacks')).toBeInTheDocument();
      expect(screen.getByLabelText('T4 Wood raw stacks')).toBeInTheDocument();
      expect(screen.queryByLabelText('T4.1 Wood raw stacks')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('T8.4 Wood raw stacks')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show T4 enchants' })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: /T3 enchants/ })).not.toBeInTheDocument();
    });

    it('expands and collapses one tier at a time', async () => {
      render(<GathererView />);
      await userEvent.click(screen.getByRole('button', { name: 'Show T5 enchants' }));
      for (const e of [1, 2, 3, 4]) expect(screen.getByLabelText(`T5.${e} Wood raw stacks`)).toBeInTheDocument();
      expect(screen.queryByLabelText('T4.1 Wood raw stacks')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Hide T5 enchants' }));
      expect(screen.queryByLabelText('T5.1 Wood raw stacks')).not.toBeInTheDocument();
    });

    it('keeps a tier open (and locked) while an enchant row holds data', () => {
      useSettings.getState().setGathererCell('wood', 'raw', stockKey(6, 2), 'units', 40);
      render(<GathererView />);
      expect(screen.getByLabelText('T6.2 Wood raw pieces')).toHaveValue(40);
      expect(screen.getByRole('button', { name: 'Hide T6 enchants' })).toBeDisabled();
      expect(screen.queryByLabelText('T7.1 Wood raw stacks')).not.toBeInTheDocument();
    });

    it('does not offer a toggle for Stone, which has no enchants', () => {
      useSettings.getState().setGathererResource('stone');
      render(<GathererView />);
      expect(screen.queryByRole('button', { name: /enchants/ })).not.toBeInTheDocument();
      expect(screen.getByLabelText('T4 Stone raw stacks')).toBeInTheDocument();
    });
  });

  it('does not claim "enough" when the highest tier has raw that cannot be refined yet', () => {
    render(<GathererView />);
    type('T2 Wood raw stacks', '2');
    type('T3 Wood raw stacks', '3');
    type('T8 Wood raw pieces', '4');
    const missing = screen.getByTestId('missing');
    expect(missing).not.toHaveTextContent('enough material');
    expect(missing).toHaveTextContent(/× T8 Wood/);
    expect(missing).toHaveTextContent(/× T7 Wood/);
    expect(screen.getByTestId('top-up')).toHaveTextContent('1 × T8 Wood');
  });

  it('lists what is missing as raw to gather, rounded up', async () => {
    render(<GathererView />);
    type('T2 Wood raw pieces', '100');
    type('T3 Wood raw pieces', '500');
    const missing = await screen.findByTestId('missing');
    expect(missing).toHaveTextContent(/59 × T2 Wood/);
    expect(missing).not.toHaveTextContent(/T3 Wood/);
  });

  it('says so when everything can be refined', () => {
    render(<GathererView />);
    type('T2 Wood raw stacks', '2');
    type('T3 Wood raw pieces', '500');
    expect(screen.getByTestId('missing')).toHaveTextContent('You have enough material to refine everything.');
  });

  it('refined stock covers a shortage and appears only after opening the section', async () => {
    render(<GathererView />);
    type('T5 Wood raw pieces', '30');
    expect(screen.getByTestId('missing')).toHaveTextContent(/Missing/);
    await userEvent.click(screen.getByRole('button', { name: 'I also have refined items' }));
    type('T4 Planks refined pieces', '10');
    expect(screen.getByTestId('missing')).toHaveTextContent('You have enough material to refine everything.');
  });

  it('tells where to sell the surplus and flags items without prices', async () => {
    render(<GathererView />);
    type('T2 Wood raw pieces', '1000');
    type('T3 Wood raw pieces', '500');
    type('T4 Wood raw pieces', '50');
    const sellSection = await screen.findByRole('region', { name: 'Where to sell' });
    await waitFor(() => expect(within(sellSection).getByText('T4 Planks')).toBeInTheDocument());
    const t4row = within(sellSection).getByText('T4 Planks').closest('tr')!;
    expect(t4row).toHaveTextContent('Brecilien');
    expect(t4row).toHaveTextContent('699');
    expect(within(sellSection).getByText('T2 Planks').closest('tr')).toHaveTextContent(/no price data/);
  });

  it('shows total Focus in Focus mode and warns when it exceeds the available Focus', async () => {
    useSettings.setState({ focusMode: true });
    useSettings.getState().patchWizard({ focusPool: 100 });
    render(<GathererView />);
    type('T4 Wood raw pieces', '200');
    const focus = await screen.findByTestId('focus-total');
    expect(focus).toHaveTextContent(/of 100 available/);
    expect(focus).toHaveTextContent(/too much/);
  });

  it('names the city to refine in, depending on the resource', async () => {
    render(<GathererView />);
    type('T2 Wood raw pieces', '10');
    expect(await screen.findByTestId('refine-city')).toHaveTextContent(/Fort Sterling.*Lumbermill/);
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'ore' } });
    type('T2 Ore raw pieces', '10');
    expect(await screen.findByTestId('refine-city')).toHaveTextContent(/Thetford.*Smelter/);
  });

  it('has its own Available Focus field in Focus mode that drives the warning', async () => {
    useSettings.setState({ focusMode: true });
    render(<GathererView />);
    type('T4 Wood raw pieces', '200');
    type('Available Focus', '1000000');
    const focus = await screen.findByTestId('focus-total');
    expect(focus).not.toHaveTextContent(/too much/);
    expect(useSettings.getState().wizard.focusPool).toBe(1000000);
    type('Available Focus', '50');
    expect(screen.getByTestId('focus-total')).toHaveTextContent(/too much/);
  });

  it('hides Available Focus without Focus mode', () => {
    render(<GathererView />);
    expect(screen.queryByLabelText('Available Focus')).not.toBeInTheDocument();
  });

  describe('transport', () => {
    const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

    it('shows the usable capacity from ox, bag and base: T8 ox + T8.4 bag', () => {
      render(<GathererView />);
      pick('Ox tier', '8');
      pick('Bag tier', '8');
      pick('Bag enchant', '4');
      // 50 base + 3200 + 469 - (119.6 ox + 17.1 bag) = 3582.3
      expect(screen.getByTestId('capacity')).toHaveTextContent('3,582 kg');
      pick('Bag quality', 'masterpiece');
      expect(screen.getByTestId('capacity')).toHaveTextContent('3,690 kg'); // 50 + 3200 + 577 - 136.7
    });

    it('base capacity defaults to 50 kg and can be changed', () => {
      render(<GathererView />);
      expect(screen.getByLabelText('Base capacity')).toHaveValue(50);
      expect(screen.getByTestId('capacity')).toHaveTextContent('Usable capacity 50.0 kg');
      pick('Base capacity', '80');
      expect(screen.getByTestId('capacity')).toHaveTextContent('Usable capacity 80.0 kg');
    });

    it('asks for capacity when there is none', () => {
      render(<GathererView />);
      pick('Base capacity', '0');
      type('T4 Wood raw pieces', '100');
      expect(screen.getByTestId('trip-refine')).toHaveTextContent(/no capacity/);
    });

    // T2 raw needs no lower tier, so only the typed raw is carried: 9 stacks = 8991 pieces = 2,067.9 kg.
    it('9 stacks of T2 raw weigh 2,068 kg: fits a T8 ox, does not fit a T3 ox', () => {
      render(<GathererView />);
      type('T2 Wood raw stacks', '9');
      pick('Ox tier', '8');
      expect(screen.getByTestId('trip-refine')).toHaveTextContent(/Fits: 2,068 kg of 3,130 kg usable \(66 %\)/);
      pick('Ox tier', '3');
      const trip = screen.getByTestId('trip-refine');
      expect(trip).toHaveTextContent(/Does not fit: 2,068 kg vs 1,537 kg usable, 531 kg over; 2 trips needed/);
    });

    it('a backpack makes the material lighter (−30 %) and uses up some capacity', async () => {
      render(<GathererView />);
      type('T2 Wood raw stacks', '9');
      pick('Ox tier', '3');
      expect(screen.getByTestId('trip-refine')).toHaveTextContent(/Does not fit/);
      await userEvent.click(screen.getByLabelText(/Lumberjack backpack instead of cape/));
      // 8991 * 0.23 * 0.7 = 1447.6 kg against 50 + 1503 - 15.8 - 8.5 = 1528.7 kg
      expect(screen.getByTestId('trip-refine')).toHaveTextContent(/Fits: 1,448 kg of 1,529 kg usable/);
      pick('Backpack tier', '4');
      expect(screen.getByTestId('capacity')).toHaveTextContent(/1,53[56] kg/); // 50 + 1503 - 15.8 - 1.7
    });

    it('also checks the refined items that are left to sell', () => {
      render(<GathererView />);
      type('T2 Wood raw pieces', '1000');
      type('T3 Wood raw pieces', '500');
      type('T4 Wood raw pieces', '50');
      pick('Ox tier', '8');
      // 1329 T2 + 369 T3 + 39 T4 refined = 451 kg
      expect(screen.getByTestId('trip-sell')).toHaveTextContent(/Fits: 451 kg/);
    });

    it('counts the raw still to gather on the way to refining', () => {
      render(<GathererView />);
      type('T5 Wood raw pieces', '30');
      pick('Ox tier', '8');
      const trip = screen.getByTestId('trip-refine');
      // 30 T5 raw (22.8 kg) plus the lower tiers that still have to be gathered.
      expect(trip).toHaveTextContent(/Includes the raw still to gather; what you have now weighs 22.8 kg/);
    });

    it('keeps the transport setup in persisted settings', () => {
      render(<GathererView />);
      pick('Ox tier', '6');
      pick('Bag tier', '5');
      const saved = JSON.parse(localStorage.getItem('albion-refin-settings') ?? '{}');
      expect(saved.state.carry).toMatchObject({ oxTier: 6, bagTier: 5 });
    });

    it('bag enchant is only available from T4', () => {
      render(<GathererView />);
      pick('Bag tier', '3');
      expect(screen.getByLabelText('Bag enchant')).toBeDisabled();
      pick('Bag tier', '6');
      expect(screen.getByLabelText('Bag enchant')).not.toBeDisabled();
    });
  });

  it('keeps what you typed per resource in persisted settings', () => {
    const { unmount } = render(<GathererView />);
    type('T2 Wood raw stacks', '2');
    unmount();
    render(<GathererView />);
    expect(screen.getByLabelText('T2 Wood raw total')).toHaveTextContent('1,998');
    const saved = JSON.parse(localStorage.getItem('albion-refin-settings') ?? '{}');
    expect(saved.state.gatherer.inventory.wood.raw['2.0']).toEqual({ stacks: 2, units: 0 });
  });

  it('clearing one resource keeps the others', async () => {
    useSettings.getState().setGathererCell('ore', 'raw', '2.0', 'units', 7);
    render(<GathererView />);
    type('T2 Wood raw pieces', '5');
    await userEvent.click(screen.getByRole('button', { name: 'Clear Wood' }));
    expect(screen.getByText(/Enter how many raw Wood pieces/)).toBeInTheDocument();
    expect(useSettings.getState().gatherer.inventory.ore.raw['2.0']).toEqual({ stacks: 0, units: 7 });
  });

  it('is reachable from the top bar', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Gatherer' }));
    expect(await screen.findByText(/Enter how many raw Wood pieces/)).toBeInTheDocument();
  });
});

describe('Wizard', () => {
  it('lists the opportunity with route, filters it out, and opens it in the calculator', async () => {
    render(<App />);
    const row = await screen.findByText('T4 Planks');
    expect(row).toBeInTheDocument();
    expect(screen.getByText(/Martlock \+ Lymhurst → Fort Sterling → Brecilien/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show plan for T4 Planks/i }));
    expect(screen.getByText(/Open in calculator/)).toBeInTheDocument();
    expect(screen.getByText(/Buy/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open in calculator/i }));
    expect(useSettings.getState().view).toBe('calculator');
    expect(useSettings.getState().seed).toMatchObject({ resource: 'wood', tier: 4, enchant: 0, rawCity: 'Martlock', sellCity: 'Brecilien' });
    expect(await screen.findByTestId('net-profit')).toBeInTheDocument();
  });

  it('shows the empty state when no result passes the ROI filter', async () => {
    render(<WizardView />);
    await screen.findByText('T4 Planks');
    fireEvent.change(screen.getByLabelText('Minimum ROI'), { target: { value: '1000000' } });
    expect(await screen.findByText(/No opportunities match/)).toBeInTheDocument();
  });

  it('hides results older than the age limit', async () => {
    render(<WizardView />);
    await screen.findByText('T4 Planks');
    // The mocked prices are 10 minutes old, so a 1 hour limit keeps them.
    fireEvent.change(screen.getByLabelText('Maximum price age'), { target: { value: '1' } });
    expect(screen.getByText('T4 Planks')).toBeInTheDocument();
  });

  it('offers SPF sorting and columns only with Focus', async () => {
    render(<App />);
    await screen.findByText('T4 Planks');
    expect(screen.queryByRole('columnheader', { name: 'SPF' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'With Focus' }));
    expect(await screen.findByRole('columnheader', { name: 'SPF' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Sort by' })).getByRole('button', { name: 'SPF' })).toBeInTheDocument();
  });

  it('marks thin-market results, explains them in the plan and can hide them', async () => {
    render(<WizardView />);
    await screen.findByText('T4 Planks');
    // Mock data: raw is 33 % cheaper in Martlock than in Thetford, lower tier exists in one city only.
    expect(screen.getByRole('img', { name: 'Thin-market warning' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show plan for T4 Planks/i }));
    const note = screen.getByRole('note', { name: 'Thin-market warnings' });
    expect(note).toHaveTextContent(/Only one city has a price/);
    expect(note).toHaveTextContent(/cheaper than the next city/);

    await userEvent.click(screen.getByLabelText('Hide results with thin-market warnings'));
    expect(await screen.findByText(/No opportunities match/)).toBeInTheDocument();
  });

  it('persists settings in localStorage', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Asia' }));
    const saved = JSON.parse(localStorage.getItem('albion-refin-settings') ?? '{}');
    expect(saved.state.server).toBe('asia');
  });
});
