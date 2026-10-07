import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLive, useLiveEvents } from '../live/LiveProvider';
import type { TestSummary } from '../../shared/protocol';

export type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all';

const DAY = 86_400_000;
export const RANGES: Array<{ value: RangeKey; label: string; ms: number | null }> = [
  { value: '24h', label: '24 h', ms: DAY },
  { value: '7d', label: '7 d', ms: 7 * DAY },
  { value: '30d', label: '30 d', ms: 30 * DAY },
  { value: '90d', label: '90 d', ms: 90 * DAY },
  { value: 'all', label: 'All', ms: null },
];

export function rangeStart(range: RangeKey): Date | null {
  const ms = RANGES.find((r) => r.value === range)?.ms ?? null;
  return ms === null ? null : new Date(Date.now() - ms);
}

interface TestsState {
  items: TestSummary[];
  next: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

/** A filtered slice of history that stays current through live events. */
export function useTests({ range, device, limit = 500 }: { range: RangeKey; device: string | null; limit?: number }) {
  const [state, setState] = useState<TestsState>({ items: [], next: null, loading: true, loaded: false, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const since = useRef<Date | null>(null);
  const { connection, db } = useLive();

  // Catch up after reconnecting or once the database comes back.
  const wasReady = useRef(false);
  const ready = connection === 'open' && db?.connected === true;
  useEffect(() => {
    if (ready && !wasReady.current && state.loaded) setReloadKey((k) => k + 1);
    wasReady.current = ready;
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    since.current = rangeStart(range);
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .tests({ since: since.current, device, limit })
      .then((page) => {
        if (!cancelled) setState({ items: page.items, next: page.nextCursor, loading: false, loaded: true, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, loaded: true, error: err.message }));
      });
    return () => {
      cancelled = true;
    };
  }, [range, device, limit, reloadKey]);

  useLiveEvents((event) => {
    if (event.t === 'test-saved') {
      const test = event.test;
      if (device && test.deviceId !== device) return;
      setState((s) => (s.items.some((t) => t.id === test.id) ? s : { ...s, items: [test, ...s.items] }));
    } else {
      setState((s) => ({ ...s, items: s.items.filter((t) => t.id !== event.id) }));
    }
  });

  const loadMore = useCallback(async () => {
    if (!state.next) return;
    const page = await api.tests({ since: since.current, device, limit, before: state.next });
    setState((s) => ({ ...s, items: [...s.items, ...page.items.filter((t) => !s.items.some((x) => x.id === t.id))], next: page.nextCursor }));
  }, [state.next, device, limit]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, loadMore, reload };
}
