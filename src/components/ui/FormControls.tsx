"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { brandGradient } from "@/lib/theme";

function FieldWrapper({ label, error, children }: { label?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">{label}</span>}
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-status-bad">{error}</span>}
    </label>
  );
}

// Recessed frosted "inset well" field - bg-white/60 at rest, brightening and
// gaining a soft brand ring on focus (the Loom Spatial Glass input recipe).
const baseInputClass =
  "w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm font-medium text-ink-900 placeholder:font-normal placeholder:text-ink-400 shadow-[inset_0_2px_4px_rgba(15,23,42,0.05)] outline-none backdrop-blur-md transition-all focus:border-brand focus:bg-white/90 focus:shadow-inner focus:ring-2 focus:ring-brand/30 disabled:border-ink-100 disabled:bg-ink-50/80 disabled:text-ink-400";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...rest }, ref) => (
    <FieldWrapper label={label} error={error}>
      <input ref={ref} className={`${baseInputClass} ${className}`} {...rest} />
    </FieldWrapper>
  ),
);
Input.displayName = "Input";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = "", children, ...rest }, ref) => (
    <FieldWrapper label={label} error={error}>
      <div className="relative">
        <select
          ref={ref}
          className={`${baseInputClass} cursor-pointer appearance-none pr-9 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5.5 8l4.5 4.5L14.5 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldWrapper>
  ),
);
Select.displayName = "Select";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...rest }, ref) => (
    <FieldWrapper label={label} error={error}>
      <textarea ref={ref} className={`${baseInputClass} resize-none ${className}`} rows={3} {...rest} />
    </FieldWrapper>
  ),
);
Textarea.displayName = "Textarea";

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-800">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-snug text-ink-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={checked ? brandGradient : undefined}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked
            ? "shadow-[0_4px_12px_-4px_rgba(21,94,239,0.6)]"
            : "bg-ink-200 shadow-[inset_2px_2px_5px_-2px_rgba(30,41,90,0.3),inset_-2px_-2px_5px_-2px_rgba(255,255,255,0.8)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[2px_2px_4px_-1px_rgba(30,41,90,0.35)] transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/** Neubrutalist checkbox - thick dark outline, a hard offset shadow instead
 * of a soft blur, and a bold two-tone flip on check. */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-3 text-sm text-ink-700">
      <span className="relative inline-flex h-6 w-6 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-[6px] border-2 border-ink-900 transition-all duration-150 group-active:translate-x-[2px] group-active:translate-y-[2px] group-active:shadow-none ${
            checked ? "bg-brand" : "bg-ink-200 group-hover:bg-ink-300"
          }`}
          style={{ boxShadow: "3px 3px 0 0 var(--color-ink-900)" }}
        >
          <span
            className={`h-[11px] w-[6px] border-white transition-opacity duration-100 ${checked ? "opacity-100" : "opacity-0"}`}
            style={{ borderStyle: "solid", borderWidth: "0 2.5px 2.5px 0", transform: "rotate(45deg) translate(-1px, -1px)" }}
          />
        </span>
        <span className="pointer-events-none absolute -inset-0.5 rounded-lg ring-2 ring-brand/50 opacity-0 peer-focus-visible:opacity-100" />
      </span>
      <span className="leading-tight">{label}</span>
    </label>
  );
}
