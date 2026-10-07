"use client";

import type { ReactNode } from "react";

/**
 * The shared layout of every "find and narrow a list of orders" panel - the
 * dashboards (Admin and MD), the Orders list, Accessories, and the floor
 * users' Home and Data Input pages - so they read as one control:
 *
 *   [ search box                        ] [ filter ] [ filter ]
 *   [ status tabs                                             ]
 *   ───────────────────────────────────────────────────────────
 *   113 of 113 orders  (Buyer: DIESEL ✕)  Clear all        [ Export CSV ]
 *
 * It is layout only: the page owns the state, and passes in the controls
 * (SearchInput, BuyerFilter / FilterSelect, FilterTabs) and the summary line.
 */
export function FilterBar({ search, filters, tabs, footer }: { search: ReactNode; filters?: ReactNode; tabs?: ReactNode; footer?: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.1),0_4px_12px_-2px_rgba(21,94,239,0.05)] backdrop-blur-md sm:p-5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand via-violet-500 to-sky-400 opacity-80" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem] flex-[3_1_18rem]">{search}</div>
          {filters && <div className="flex min-w-0 flex-[2_1_22rem] flex-wrap items-end gap-3 [&>*]:min-w-[10.5rem] [&>*]:flex-[1_1_10.5rem]">{filters}</div>}
        </div>
        {tabs}
        {footer && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink-100 pt-3.5">{footer}</div>}
      </div>
    </section>
  );
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * The footer of a FilterBar: how many results are showing, a removable chip for
 * every filter that is narrowing them, a "Clear all", and the page's actions
 * (Export CSV...) on the right.
 */
export function FilterSummary({
  shown,
  total,
  noun,
  chips = [],
  onClear,
  actions,
  extra,
}: {
  shown: number;
  total: number;
  /** "orders", "accessories"... */
  noun: string;
  chips?: FilterChip[];
  /** Pass only when something is filtered - it renders the "Clear all" link. */
  onClear?: () => void;
  actions?: ReactNode;
  /** More text after the count, e.g. "· 12 of 40 orders". */
  extra?: ReactNode;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="text-sm text-ink-600">
          <b className="font-bold tabular-nums text-ink-900">{shown.toLocaleString()}</b> of {total.toLocaleString()} {noun}
          {extra}
        </span>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            className="group inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.07] py-1 pl-2.5 pr-1.5 text-xs font-semibold text-brand transition-colors hover:border-brand/50 hover:bg-brand/[0.12]"
          >
            <span className="truncate">{chip.label}</span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/15 transition-colors group-hover:bg-brand group-hover:text-white" aria-hidden>
              <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </span>
          </button>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className="rounded-md px-1.5 py-1 text-xs font-semibold text-ink-500 underline-offset-2 transition-colors hover:text-brand hover:underline">
            Clear all
          </button>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </>
  );
}
