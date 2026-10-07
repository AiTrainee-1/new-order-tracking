"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The dropdown every filter bar uses - Buyer, Sort by, Choose Order... - in
 * place of the browser's native <select>, whose option list can't be styled and
 * looks different on every device.
 *
 * A trigger that shows the current choice (tinted when it isn't the "everything"
 * default, so an active filter is visible at a glance), and a floating list
 * with a check on the selected option, an optional hint on each (a count, say),
 * and a search box once there are enough options to need one. Fully keyboard
 * operable: arrows, Home/End, Enter, Escape, and type-to-jump.
 *
 * The list is portalled to <body> in fixed coordinates, like the stage tooltips,
 * so the frosted cards it opens from can never clip it.
 */

export interface FilterSelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Small right-aligned text, e.g. an order count. */
  hint?: string;
}

interface FilterSelectProps<T extends string> {
  label?: string;
  value: T;
  onChange: (next: T) => void;
  options: FilterSelectOption<T>[];
  /** Leading icon in the trigger. */
  icon?: ReactNode;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  /** Force the search box on or off; by default it appears from 8 options up. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** The "everything" choice - the trigger only highlights when `value` differs from it. Defaults to the first option. */
  neutralValue?: T;
  disabled?: boolean;
  className?: string;
}

const SEARCH_FROM = 8;
const LIST_MAX = 320;

export const FilterIcon = {
  buyer: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6M9 11h.01M15 11h.01" />
    </svg>
  ),
  sort: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
    </svg>
  ),
  order: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3.3 7.5L12 12.5l8.7-5M12 22V12.5" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  stage: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 12h3M14 12h3" />
    </svg>
  ),
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200 ${open ? "rotate-180 text-brand" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5.5 8l4.5 4.5L14.5 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  icon,
  placeholder = "Select…",
  searchable,
  searchPlaceholder = "Search…",
  neutralValue,
  disabled,
  className = "",
}: FilterSelectProps<T>) {
  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", timer: 0 as unknown as ReturnType<typeof setTimeout> });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);

  const showSearch = searchable ?? options.length >= SEARCH_FROM;
  const selected = options.find((o) => o.value === value);
  const neutral = neutralValue ?? options[0]?.value;
  const isActive = !!selected && value !== neutral;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function openList() {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const width = Math.max(rect.width, 220);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    // Open upward only when there is clearly more room above than below.
    const up = below < 220 && above > below;
    setPos(
      up
        ? { bottom: window.innerHeight - rect.top + 6, left, width, maxHeight: Math.min(LIST_MAX, above - 6) }
        : { top: rect.bottom + 6, left, width, maxHeight: Math.min(LIST_MAX, below - 6) },
    );
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(refocus = false) {
    setOpen(false);
    // preventScroll: the trigger often sits inside an overflow-hidden card, which
    // a plain focus() would otherwise nudge sideways.
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function choose(option: FilterSelectOption<T>) {
    onChange(option.value);
    close(true);
  }

  // Close on an outside press, a page scroll or a resize - the list is pinned to
  // viewport coordinates, so it would otherwise drift away from its trigger.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Put focus in the list (or its search box) when it opens.
  useEffect(() => {
    if (!open) return;
    (searchRef.current ?? listRef.current)?.focus({ preventScroll: true });
  }, [open]);

  // Keep the highlighted option on screen as the arrow keys move it.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onListKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(visible.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible[active]) choose(visible[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (!showSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-to-jump when there is no search box.
      clearTimeout(typeahead.current.timer);
      typeahead.current.text += e.key.toLowerCase();
      typeahead.current.timer = setTimeout(() => (typeahead.current.text = ""), 600);
      const hit = visible.findIndex((o) => o.label.toLowerCase().startsWith(typeahead.current.text));
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <div className={`block ${className}`}>
      {label && (
        <label htmlFor={`${uid}-trigger`} className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={`${uid}-trigger`}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) openList();
          }
        }}
        className={`group flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium outline-none transition-all duration-150 focus-visible:ring-4 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60 ${
          open
            ? "border-brand bg-white shadow-[0_0_0_4px_rgba(21,94,239,0.12)]"
            : isActive
              ? "border-brand/40 bg-brand/[0.06] text-ink-900 hover:border-brand/60"
              : "border-ink-200/80 bg-white/80 text-ink-800 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] hover:border-ink-300 hover:bg-white"
        }`}
      >
        {icon && <span className={`shrink-0 transition-colors ${isActive || open ? "text-brand" : "text-ink-400 group-hover:text-ink-500"}`}>{icon}</span>}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-ink-400"}`}>{selected?.label ?? placeholder}</span>
        {isActive && !open && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear this filter"
            onClick={(e) => {
              e.stopPropagation();
              if (neutral !== undefined) onChange(neutral);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors hover:bg-brand hover:text-white"
          >
            <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </span>
        )}
        <Chevron open={open} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            className="fixed z-[400] flex animate-fadeInUp flex-col overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-[0_24px_60px_-18px_rgba(30,41,90,0.45),0_6px_18px_-6px_rgba(30,41,90,0.2)] ring-1 ring-black/[0.03]"
            onKeyDown={onListKeyDown}
          >
            {showSearch && (
              <div className="border-b border-ink-100 p-2">
                <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/25">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-400" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-400"
                  />
                </div>
              </div>
            )}
            <ul ref={listRef} id={`${uid}-list`} role="listbox" tabIndex={-1} aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none">
              {visible.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-ink-400">Nothing matches &ldquo;{query}&rdquo;</li>
              ) : (
                visible.map((o, i) => {
                  const isSel = o.value === value;
                  return (
                    <li
                      key={o.value}
                      role="option"
                      aria-selected={isSel}
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        i === active ? "bg-brand/[0.08]" : ""
                      } ${isSel ? "font-semibold text-brand" : "text-ink-800"}`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {isSel && (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-500">{o.hint}</span>}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
