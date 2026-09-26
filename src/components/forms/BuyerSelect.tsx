"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBuyers, useCreateBuyer } from "@/hooks/useBuyers";
import { Button } from "@/components/ui/Button";

/**
 * Buyer picker for the order forms: a searchable dropdown of every buyer
 * already saved, with an "Add New Buyer" option at the bottom for one that
 * isn't there yet. A newly added buyer is saved straight away (POST
 * /api/buyers) and selected, so it is in the list for every later order.
 */
export function BuyerSelect({
  value,
  onChange,
  label = "Buyer Name",
}: {
  /** Selected buyer id, or "" for none. */
  value: string;
  onChange: (buyerId: string) => void;
  label?: string;
}) {
  const { data: buyers = [] } = useBuyers();
  const createBuyer = useCreateBuyer();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = buyers.find((b) => b.id === value) ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? buyers.filter((b) => b.name.toLowerCase().includes(q)) : buyers;
  }, [buyers, search]);

  function close() {
    setOpen(false);
    setAdding(false);
    setSearch("");
    setNewName("");
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(id: string) {
    onChange(id);
    close();
  }

  async function saveNew() {
    setError(null);
    try {
      const buyer = await createBuyer.mutateAsync(newName);
      pick(buyer.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the buyer.");
    }
  }

  return (
    <div ref={rootRef} className="relative block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-600">{label}</span>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-left text-sm font-medium text-ink-900 shadow-[inset_0_2px_4px_rgba(15,23,42,0.05)] outline-none backdrop-blur-md transition-all focus:border-brand focus:ring-2 focus:ring-brand/30"
      >
        <span className={selected ? "truncate" : "truncate font-normal text-ink-400"}>{selected?.name ?? "Select a buyer…"}</span>
        <svg className="h-4 w-4 shrink-0 text-ink-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5.5 8l4.5 4.5L14.5 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full min-w-[15rem] rounded-xl border border-ink-200 bg-white p-2 shadow-xl">
          {adding ? (
            <div className="space-y-2">
              <p className="px-1 text-xs font-semibold text-ink-600">New buyer name</p>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newName.trim()) void saveNew();
                  }
                }}
                placeholder="e.g. H&M"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              {error && <p className="px-1 text-xs font-medium text-status-bad">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                  Back
                </Button>
                <Button type="button" onClick={() => void saveNew()} isLoading={createBuyer.isPending} disabled={!newName.trim()}>
                  Save Buyer
                </Button>
              </div>
            </div>
          ) : (
            <>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search buyers…"
                className="mb-1.5 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              <ul role="listbox" className="max-h-48 overflow-y-auto">
                {value && (
                  <li>
                    <button type="button" onClick={() => pick("")} className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink-500 hover:bg-ink-50">
                      No buyer
                    </button>
                  </li>
                )}
                {matches.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={b.id === value}
                      onClick={() => pick(b.id)}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-brand/10 ${b.id === value ? "bg-brand/10 font-semibold text-brand" : "text-ink-800"}`}
                    >
                      {b.name}
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-2.5 py-2 text-xs text-ink-400">{buyers.length === 0 ? "No buyers saved yet." : "No buyer matches your search."}</li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setNewName(search.trim());
                  setAdding(true);
                }}
                className="mt-1.5 w-full rounded-md border-t border-ink-100 px-2.5 pb-1.5 pt-2.5 text-left text-sm font-semibold text-brand hover:underline"
              >
                ＋ Add New Buyer{search.trim() ? ` “${search.trim()}”` : ""}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
