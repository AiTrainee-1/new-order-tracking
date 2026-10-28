"use client";

import { useCallback, useRef } from "react";

/**
 * The "click an overview tile to filter the list below" behaviour the list
 * pages share: a click selects that filter AND scrolls the results into view
 * (the overview sits above the list, so without the scroll the click would
 * seem to do nothing), and clicking the same tile again goes back to "all".
 *
 * The filter state itself stays with the page - persisted or plain useState -
 * so this only owns the results ref and the toggle. Put `resultsRef` on the
 * list's wrapper, with a `scroll-mt-*` so it doesn't land flush to the top.
 */
export function useFilterReveal<F extends string>(filter: F | "all", setFilter: (next: F | "all") => void) {
  const resultsRef = useRef<HTMLDivElement>(null);

  /** Bring the results into view - after the next paint, so it scrolls to
   *  where the list ends up once the new filter has rendered. */
  const revealResults = useCallback(() => {
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  function toggleFilter(key: F | "all") {
    const next = filter === key ? "all" : key;
    setFilter(next);
    if (next !== "all") revealResults();
  }

  return { resultsRef, revealResults, toggleFilter };
}
