"use client";

import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from "react";

/**
 * The search box every list and filter bar uses: a clean rounded field with a
 * leading magnifier that turns brand-blue on focus, a soft focus ring, and a
 * clear (x) button as soon as there is something to clear.
 *
 * It stays a plain controlled <input>: the clear button sets the value through
 * the native setter and fires a real input event, so a caller's ordinary
 * `onChange` handles it and nothing about the props changes.
 */

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({ label, className = "", ...rest }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const hasValue = typeof rest.value === "string" ? rest.value.length > 0 : false;

  function clear() {
    const input = inputRef.current;
    if (!input) return;
    // React tracks the value itself, so go through the prototype's setter.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">{label}</span>}
      <span className="group relative block">
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 transition-colors group-focus-within:text-brand"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          {...rest}
          className="w-full rounded-xl border border-ink-200/80 bg-white/80 py-2.5 pl-10 pr-10 text-sm font-medium text-ink-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-all duration-150 placeholder:font-normal placeholder:text-ink-400 hover:border-ink-300 hover:bg-white focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
        />
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-ink-100 text-ink-500 transition-colors hover:bg-brand hover:text-white"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        )}
      </span>
    </label>
  );
});
SearchInput.displayName = "SearchInput";
