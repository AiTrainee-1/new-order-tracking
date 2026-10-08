"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

/**
 * Filter state that survives leaving the page and coming back - the search
 * box, the buyer pick, the status tab, the page number.
 *
 * Held in sessionStorage, so it lasts as long as the browser tab does (a
 * fresh tab, or a new login in a fresh tab, starts clean) and needs no
 * server. It is read through useSyncExternalStore rather than copied into
 * state from an effect: the server render and the hydration pass see the
 * defaults (there is no sessionStorage there), and the saved value takes
 * over right after - while a client-side navigation BACK to the page, which
 * has no hydration, reads the saved value on the very first render with no
 * flash of an empty search box.
 *
 * `key` should include whatever scopes the state (the page, the user), so
 * two people sharing a tab, or two pages, never read each other's filters.
 */

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  // Another tab on the same site can't change THIS tab's sessionStorage, but
  // the event also fires for same-tab writes in some browsers' devtools - a
  // cheap, harmless re-read.
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea === window.sessionStorage) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Private mode / blocked storage: behave as plain, non-persistent state.
    return null;
  }
}

/** Fallback for when sessionStorage is unavailable - still keeps the value
 *  for as long as the page is open, so the filters at least work. */
const memoryFallback = new Map<string, string>();

function read(key: string): string | null {
  return readRaw(key) ?? memoryFallback.get(key) ?? null;
}

function write(key: string, value: string) {
  memoryFallback.set(key, value);
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* kept in memoryFallback above */
  }
  listeners.forEach((l) => l());
}

export function usePersistedFilters<T extends object>(key: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  // `defaults` must be a module-level constant at the call site, so it never
  // changes identity and never re-runs the parse below.
  const value = useMemo<T>(() => {
    if (raw == null) return defaults;
    try {
      // Spread over the defaults so a field added to the filters later is
      // never missing from something saved by an older version of the page.
      return { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      return defaults;
    }
  }, [raw, defaults]);

  const patch = useCallback(
    (next: Partial<T>) => {
      const currentRaw = read(key);
      let current: T = defaults;
      if (currentRaw != null) {
        try {
          current = { ...defaults, ...(JSON.parse(currentRaw) as Partial<T>) };
        } catch {
          /* fall back to defaults */
        }
      }
      write(key, JSON.stringify({ ...current, ...next }));
    },
    [key, defaults],
  );

  return [value, patch];
}

/**
 * One value that survives leaving the page and coming back - the single-value
 * form of usePersistedFilters, for pages whose filters are separate useState
 * calls (a search box, a buyer pick, a tab...). Same storage, same rules: it
 * lasts as long as the browser tab, the server render and hydration see
 * `fallback`, and the saved value takes over right after.
 *
 * `isValid` guards an enum-like value against something stale saved by an older
 * version of the page - anything it rejects reads as `fallback`.
 */
export function usePersistedState<T>(key: string, fallback: T, isValid?: (value: unknown) => boolean): [T, (next: T | ((prev: T) => T)) => void] {
  const [defaults] = useState(() => ({ v: fallback }));
  const [value, patch] = usePersistedFilters<{ v: T }>(key, defaults);
  const current = isValid && !isValid(value.v) ? fallback : value.v;
  const set = useCallback(
    (next: T | ((prev: T) => T)) => patch({ v: typeof next === "function" ? (next as (prev: T) => T)(current) : next }),
    [patch, current],
  );
  return [current, set];
}
