import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
}

/** A tiny localStorage-backed store. Storage can be unavailable (private mode), so every access is guarded. */
export function persistentStore<T>(key: string, fallback: () => T, sanitize: (raw: unknown) => T): Store<T> {
  const listeners = new Set<() => void>();
  let value: T = (() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return sanitize(JSON.parse(raw));
    } catch {
      // fall through to the default
    }
    return fallback();
  })();

  return {
    get: () => value,
    set(next) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // not persisted, still applied for this session
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
