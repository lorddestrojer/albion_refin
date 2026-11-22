import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketState } from '@/api/useMarket';
import DataBanner from './shared/DataBanner';

const base: MarketState = { loading: false, result: null, error: null, refresh: vi.fn() };

describe('DataBanner', () => {
  it('shows loading', () => {
    render(<DataBanner market={{ ...base, loading: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading prices/);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('warns clearly about offline mock data', () => {
    render(
      <DataBanner
        market={{
          ...base,
          result: {
            book: {},
            fetchedAt: Date.now(),
            source: 'mock',
            warning: { kind: 'offline', message: 'Failed to fetch', resetAt: null },
          },
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Offline – mock data/);
  });

  it('explains throttling with the reset time and the cached fallback', () => {
    render(
      <DataBanner
        market={{
          ...base,
          result: {
            book: {},
            fetchedAt: Date.now() - 10 * 60_000,
            source: 'cache',
            warning: { kind: 'throttled', message: 'throttled', resetAt: Date.now() + 60_000 },
          },
        }}
      />,
    );
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toMatch(/throttling/);
    expect(text).toMatch(/Try again after/);
    expect(text).toMatch(/cached data \(10 min old\)/);
  });

  it('shows live data and errors', () => {
    const { rerender } = render(
      <DataBanner market={{ ...base, result: { book: {}, fetchedAt: Date.now(), source: 'live', warning: null } }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Live prices/);
    rerender(<DataBanner market={{ ...base, error: 'boom' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Could not load prices: boom/);
  });
});
