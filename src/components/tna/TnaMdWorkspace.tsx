"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBuyers } from "@/hooks/useBuyers";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useNow, useTnaOverview } from "@/hooks/useTna";
import { recordSearchText } from "@/lib/tnaView";
import type { TnaRecord } from "@/lib/tna";
import { FilterIcon, FilterSelect } from "@/components/ui/FilterSelect";
import { Loader } from "@/components/ui/Loader";
import { TnaCanvas } from "./TnaCanvas";
import { TnaDetailModal } from "./TnaDetailModal";

const ALL = "all";

/**
 * MD's TNA: nothing but the order filters and the graphical timeline, as a
 * full-screen pan-and-zoom workspace. (Assigning and editing TNA is Admin's -
 * this page only looks.)
 */
export function TnaMdWorkspace() {
  const { appUser } = useAuth();
  const who = appUser?.id ?? "anon";
  const { data: all = [], isLoading, isError } = useTnaOverview();
  const { data: buyers = [] } = useBuyers();
  const now = useNow(30_000);

  const [search, setSearch] = usePersistedState(`ot:tna-md:${who}:search`, "");
  const [buyerId, setBuyerId] = usePersistedState(`ot:tna-md:${who}:buyer`, "");
  const [ioNo, setIoNo] = usePersistedState(`ot:tna-md:${who}:io`, ALL);
  const [orderId, setOrderId] = usePersistedState(`ot:tna-md:${who}:order`, ALL);
  const [selected, setSelected] = useState<TnaRecord | null>(null);

  // Hidden orders aren't live work - left out, as everywhere else.
  const live = useMemo(() => all.filter((r) => !r.order?.isHidden), [all]);
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.filter((r) => (!buyerId || r.order?.buyer?.id === buyerId) && (ioNo === ALL || r.order?.ioNo === ioNo) && (orderId === ALL || r.orderId === orderId) && (!q || recordSearchText(r).includes(q)));
  }, [live, search, buyerId, ioNo, orderId]);

  // Each pick-list follows the choices above it.
  const buyerScoped = useMemo(() => live.filter((r) => !buyerId || r.order?.buyer?.id === buyerId), [live, buyerId]);
  const ioOptions = useMemo(() => Array.from(new Set(buyerScoped.map((r) => r.order?.ioNo).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [buyerScoped]);
  const orderOptions = useMemo(() => {
    const by = new Map<string, string>();
    for (const r of buyerScoped) {
      if (ioNo !== ALL && r.order?.ioNo !== ioNo) continue;
      if (r.order && !by.has(r.orderId)) by.set(r.orderId, `IO ${r.order.ioNo} · ${r.order.style}${r.order.color ? ` · ${r.order.color}` : ""}`);
    }
    return [...by.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  }, [buyerScoped, ioNo]);
  const buyerNames = useMemo(() => new Set(live.map((r) => r.order?.buyer?.id).filter(Boolean) as string[]), [live]);

  const orders = new Set(scoped.map((r) => r.orderId)).size;
  const anyFilter = !!(search.trim() || buyerId || ioNo !== ALL || orderId !== ALL);
  function clearAll() {
    setSearch("");
    setBuyerId("");
    setIoNo(ALL);
    setOrderId(ALL);
  }

  if (isLoading) return <Loader full label="Loading TNA…" />;
  if (isError) return <p className="p-6 text-sm text-status-bad">Couldn&apos;t load the TNA. Check the database connection.</p>;

  if (live.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-white/80 bg-white/80 p-8 text-center shadow-[0_12px_32px_-8px_rgba(15,23,42,0.12)]">
          <p className="text-2xl">⏱️</p>
          <p className="mt-2 text-sm font-semibold text-ink-800">No TNA assigned yet</p>
          <p className="mt-1 text-sm text-ink-500">When the admin schedules an order&apos;s stages, its timeline appears here.</p>
        </div>
      </div>
    );
  }

  // Compact: this bar sits above the canvas and everything below it is chart. The left padding on
  // small screens clears the menu button that floats over this corner.
  const filters = (
    <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-white/70 bg-white/85 px-3 py-2 pl-14 md:flex-wrap md:overflow-visible md:pl-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="flex items-center gap-2 pr-1 text-sm font-extrabold text-ink-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-white shadow-sm" style={{ backgroundImage: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 100%)" }}>
          ⏱️
        </span>
        <span className="hidden sm:inline">TNA</span>
      </span>
      <label className="relative min-w-[11rem] shrink-0 flex-1 sm:max-w-[16rem]">
        <span className="sr-only">Search orders</span>
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search IO, style, buyer, colour, stage…" className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400 focus:border-brand focus:ring-2 focus:ring-brand/20" />
      </label>
      <FilterSelect
        value={buyerId}
        onChange={(v) => {
          setBuyerId(v);
          setIoNo(ALL);
          setOrderId(ALL);
        }}
        icon={FilterIcon.buyer}
        className="w-44 shrink-0"
        searchPlaceholder="Search buyers…"
        options={[{ value: "", label: "All buyers" }, ...buyers.filter((b) => buyerNames.has(b.id)).map((b) => ({ value: b.id, label: b.name }))]}
      />
      <FilterSelect
        value={ioNo}
        onChange={(v) => {
          setIoNo(v);
          setOrderId(ALL);
        }}
        icon={FilterIcon.order}
        className="w-40 shrink-0"
        neutralValue={ALL}
        searchPlaceholder="Search IO numbers…"
        options={[{ value: ALL, label: "All IOs" }, ...ioOptions.map((io) => ({ value: io, label: `IO ${io}` }))]}
      />
      <FilterSelect value={orderId} onChange={setOrderId} icon={FilterIcon.order} className="w-56 shrink-0" neutralValue={ALL} searchPlaceholder="Search orders…" options={[{ value: ALL, label: `All orders (${orderOptions.length})` }, ...orderOptions.map(([id, label]) => ({ value: id, label }))]} />
      {anyFilter && (
        <button type="button" onClick={clearAll} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10">
          Clear
        </button>
      )}
      <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-xs font-medium text-ink-500">
        {scoped.length} stage{scoped.length === 1 ? "" : "s"} · {orders} order{orders === 1 ? "" : "s"}
      </span>
    </div>
  );

  return (
    <div className="h-full min-h-0">
      {/* The dialog lives INSIDE the canvas: in full screen the browser draws nothing outside it. */}
      <TnaCanvas records={scoped} now={now} onSelect={setSelected} filters={filters}>
        <TnaDetailModal record={selected} now={now} onClose={() => setSelected(null)} canEdit={false} />
      </TnaCanvas>
    </div>
  );
}
