import { useCallback, useEffect, useState } from 'react';
import type { Resource, Server } from '@/data/types';
import { DEFAULT_TTL_MS, type MarketResult, loadMarket } from './market';

export interface MarketState {
  loading: boolean;
  result: MarketResult | null;
  /** Unexpected failure (not network/throttle, those fall back to cache or mock). */
  error: string | null;
  refresh: () => void;
}

interface Settled {
  key: string;
  result: MarketResult | null;
  error: string | null;
}

/**
 * Prices for one server and resource type. Changing either triggers a new load;
 * results of an older request are ignored (aborted).
 */
export function useMarket(server: Server, resource: Resource, ttlMs: number = DEFAULT_TTL_MS): MarketState {
  const [tick, setTick] = useState(0);
  const [force, setForce] = useState(false);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${server}:${resource}:${ttlMs}:${tick}`;

  useEffect(() => {
    const controller = new AbortController();
    loadMarket(server, resource, { ttlMs, force, signal: controller.signal })
      .then((result) => setSettled({ key, result, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ key, result: null, error: err instanceof Error ? err.message : 'Unknown error' });
      });
    return () => controller.abort();
    // `force` is read once per key change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = useCallback(() => {
    setForce(true);
    setTick((t) => t + 1);
  }, []);

  const current = settled && settled.key === key ? settled : null;
  return {
    loading: current === null,
    result: current?.result ?? null,
    error: current?.error ?? null,
    refresh,
  };
}
