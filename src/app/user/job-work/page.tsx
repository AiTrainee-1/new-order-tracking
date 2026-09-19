"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useOrdersList } from "@/hooks/useOrdersList";
import { useStageChain, useCreateTxns, type NewTxn } from "@/hooks/useProductionChain";
import { stageQtyLabels } from "@/lib/stageLabels";
import { formatDisplayDate } from "@/lib/workflow";
import { CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/FormControls";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { AccentCard, PageHero, SectionTitle } from "@/components/ui/SectionCard";
import type { IconTone } from "@/lib/theme";
import type { StageFormType } from "@/lib/types";

type JobWorkMode = "total" | "size";

const MODE_TABS: { key: JobWorkMode; label: string }[] = [
  { key: "total", label: "Total Count" },
  { key: "size", label: "Size-wise Count" },
];

/** Stages with no real production_txns ledger at all - the 3 procurement
 * stages (which use material_entries instead) and the confirmation-only
 * pass-throughs. "How many pieces did job work produce for Order
 * Confirmation" isn't a coherent question, so these never appear in the
 * section picker. */
const NO_LEDGER_FORM_TYPES = new Set<StageFormType>(["confirmation", "simple_confirm", "material_planning", "supplier_dc", "material_inward"]);

/** Round-trip stages record their real output on txnType 'receive' - their
 * 'send' rows only ever carry qtyIn (see chainForms.tsx's SEND_RECEIVE_COPY
 * and EmbroideryForm). Every other production stage records output on
 * 'process'. Keyed by the frozen catalog `key`. */
const ROUND_TRIP_STAGE_KEYS = new Set<string>([
  "knitting",
  "dyeing",
  "brushing",
  "compacting",
  "acid_wash",
  "heat_setting",
  "washing",
  "cpl_wash",
  "lubricant_wash",
  "bit_cutting",
  "embroidery",
  "garment_die",
  "printing",
  "stone",
]);

/**
 * The Job Work user's own page: pick any order, pick any of that order's own
 * stages that actually track a production quantity, see that stage's
 * numbers so far as reference, then log an externally-manufactured quantity
 * against it.
 *
 * The entry is a REAL production_txns row - the same table and the same
 * chain.ts calculation every floor worker's own entry lands in, via the same
 * useCreateTxns() every stage form already uses. It is tagged
 * isJobWork: true purely for provenance/display; chain.ts has no idea the
 * flag exists, so it counts toward that stage's actual output, balance, and
 * what the next stage inherits as available, exactly like an in-house entry.
 * It deliberately does NOT write a stage_entries row - a Job Work entry
 * never marks a stage Forwarded/Complete or unlocks the next assigned
 * worker; that stays driven only by the assigned floor worker's own actions.
 *
 * Reachable only with canJobWork (granted from Stage Roles); the nav item is
 * hidden without it, and this is the backstop if someone still types the URL
 * directly. The real backstop is server-side, in the txns API's authz check.
 */
export default function JobWorkPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const ordersQuery = useOrdersList({ includeStagePlan: true });

  const [orderId, setOrderId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [mode, setMode] = useState<JobWorkMode>("total");
  const [vendor, setVendor] = useState("");
  const [docNo, setDocNo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [totalQty, setTotalQty] = useState("");
  const [sizeQty, setSizeQty] = useState<Record<string, string>>({});

  const order = ordersQuery.data?.find((o) => o.id === orderId) ?? null;
  const stages = useMemo(() => (order?.stagePlan ?? []).filter((s) => !NO_LEDGER_FORM_TYPES.has(s.formType)), [order]);
  const stage = stages.find((s) => s.id === sectionId) ?? null;
  const canSizeWise = stage?.unitType === "PCS";
  const effectiveMode: JobWorkMode = canSizeWise ? mode : "total";

  const stageChain = useStageChain(orderId || undefined, null, sectionId || undefined);
  const createTxns = useCreateTxns();

  const jobWorkTxns = useMemo(() => (stageChain.cs?.txns ?? []).filter((t) => t.isJobWork), [stageChain.cs]);
  const sectionTotal = jobWorkTxns.reduce((sum, t) => sum + (t.qtyOut || t.qtyIn), 0);

  useEffect(() => {
    if (appUser && !appUser.canJobWork) router.replace("/user/home");
  }, [appUser, router]);

  if (!appUser || !appUser.canJobWork) return <Loader full label="Loading…" />;

  const labels = stage ? stageQtyLabels(stage.key) : null;

  function resetForm() {
    setVendor("");
    setDocNo("");
    setNotes("");
    setTotalQty("");
    setSizeQty({});
  }

  async function handleSave() {
    if (!appUser || !order || !stage) return;
    if (!vendor.trim()) {
      toast.error("Enter a vendor name.");
      return;
    }
    if (!notes.trim()) {
      toast.error("Add a note for this entry.");
      return;
    }

    const txnType = ROUND_TRIP_STAGE_KEYS.has(stage.key) ? "receive" : "process";
    const base = {
      orderId: order.id,
      poId: null,
      sectionId: stage.id,
      lotId: null,
      txnType,
      unit: stage.unitType,
      qtyIn: 0,
      qtyRejected: 0,
      qtyRework: 0,
      refName: vendor.trim(),
      docNo: docNo.trim() || null,
      entryDate: date,
      notes: notes.trim(),
      enteredBy: appUser.id,
      isJobWork: true,
    } as const;

    let rows: NewTxn[];
    if (effectiveMode === "total") {
      const qty = Number(totalQty) || 0;
      if (qty <= 0) {
        toast.error("Enter a quantity.");
        return;
      }
      rows = [{ ...base, sizeCode: null, qtyOut: qty }];
    } else {
      rows = (stageChain.sizes ?? [])
        .map((s) => ({ ...base, sizeCode: s.sizeCode, qtyOut: Number(sizeQty[s.sizeCode]) || 0 }))
        .filter((r) => r.qtyOut > 0);
      if (rows.length === 0) {
        toast.error("Enter a quantity for at least one size.");
        return;
      }
    }

    try {
      await createTxns.mutateAsync(rows);
      toast.success(`${vendor.trim()}: job work recorded for ${stage.label}.`);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the entry.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon="🧵"
        iconBg="linear-gradient(135deg, #FBBF24 0%, #F97316 100%)"
        title="Job Work"
        titleGradient="linear-gradient(100deg, #D97706 0%, #DB2777 60%, #7C3AED 100%)"
        description={
          <>
            Log a quantity manufactured outside the company for any order and any stage - it&apos;s recorded as a real production entry, counted in that stage&apos;s actual output and everywhere
            else the app tracks quantity, exactly like an in-house entry. It never marks a stage complete or moves it forward - that stays with the assigned floor worker.
          </>
        }
      />

      <AccentCard tone="sky">
        <CardHeader title={<SectionTitle icon="🔍" tone="sky">Order & Section</SectionTitle>} subtitle="Pick what this job work entry is against." />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Order"
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">Choose an order…</option>
            {(ordersQuery.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                IO {o.ioNo} · {o.style} {o.color ? `· ${o.color}` : ""}
              </option>
            ))}
          </Select>
          <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!orderId}>
            <option value="">Choose a section…</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.unitType})
              </option>
            ))}
          </Select>
        </CardBody>
      </AccentCard>

      {order && stage && (
        <>
          <AccentCard tone="violet">
            <CardHeader title={<SectionTitle icon="📊" tone="violet">{`${stage.label} - so far`}</SectionTitle>} subtitle="What's been recorded through the normal workflow AND job work, combined - this is the stage's real total." />
            <CardBody>
              {stageChain.isLoading ? (
                <Loader label="Loading this stage's numbers…" />
              ) : !stageChain.cs ? (
                <p className="text-sm text-ink-400">Nothing recorded here yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <RefStat label={labels?.in ?? "Input"} value={stageChain.cs.input} unit={stage.unitType} tone="sky" />
                  <RefStat label={labels?.out ?? "Output"} value={stageChain.cs.output} unit={stage.unitType} tone="emerald" />
                  <RefStat label={labels?.balance ?? "Balance"} value={stageChain.cs.balance} unit={stage.unitType} tone="slate" />
                  <RefStat label="Of which, Job Work" value={sectionTotal} unit={stage.unitType} tone="amber" />
                </div>
              )}
            </CardBody>
          </AccentCard>

          <AccentCard tone="emerald">
            <CardHeader title={<SectionTitle icon="✍️" tone="emerald">Add a Job Work Entry</SectionTitle>} subtitle="Vendor, DC number and date, then the quantity - as one total or size by size. Saved as a real entry for this stage." />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label="Vendor Name" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Unit / vendor name" />
                <Input label="DC Name" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
                <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              {canSizeWise && <FilterTabs tabs={MODE_TABS} value={mode} onChange={setMode} />}

              {effectiveMode === "total" ? (
                <Input label={`Quantity (${stage.unitType})`} type="number" min={0} value={totalQty} onChange={(e) => setTotalQty(e.target.value)} />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-ink-100 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.3)]">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-emerald-50 to-teal-50 text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="px-3 py-2 text-left font-semibold">Size</th>
                        <th className="px-3 py-2 text-right font-semibold">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {(stageChain.sizes ?? []).map((s) => (
                        <tr key={s.sizeCode} className="bg-white transition-colors hover:bg-emerald-50/40">
                          <td className="px-3 py-1.5 font-semibold text-ink-900">{s.sizeCode}</td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={sizeQty[s.sizeCode] ?? ""}
                              onChange={(e) => setSizeQty((prev) => ({ ...prev, [s.sizeCode]: e.target.value }))}
                              className="w-24 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Textarea label="Notes" required value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kept with this entry" />

              <div className="-mx-6 -mb-5 flex justify-end rounded-b-2xl border-t border-white/70 bg-gradient-to-r from-emerald-50/70 to-white/70 px-6 py-4">
                <Button onClick={handleSave} isLoading={createTxns.isPending}>
                  Save Entry
                </Button>
              </div>
            </CardBody>
          </AccentCard>

          <AccentCard tone="rose">
            <CardHeader title={<SectionTitle icon="📋" tone="rose">Job Work Entries So Far</SectionTitle>} subtitle={`${sectionTotal.toLocaleString()} ${stage.unitType} logged for ${stage.label} on this order.`} />
            <CardBody>
              {jobWorkTxns.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">Nothing recorded here yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-ink-100 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.3)]">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-rose-50 to-amber-50 text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="px-3 py-2 text-left font-semibold">Date</th>
                        <th className="px-3 py-2 text-left font-semibold">Vendor</th>
                        <th className="px-3 py-2 text-left font-semibold">DC</th>
                        <th className="px-3 py-2 text-left font-semibold">Size</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {jobWorkTxns.map((t) => (
                        <tr key={t.id} className="bg-white transition-colors hover:bg-rose-50/40">
                          <td className="px-3 py-1.5 text-ink-700">{formatDisplayDate(t.entryDate)}</td>
                          <td className="px-3 py-1.5 text-ink-700">{t.refName ?? "-"}</td>
                          <td className="px-3 py-1.5 text-ink-700">{t.docNo ?? "-"}</td>
                          <td className="px-3 py-1.5 text-ink-700">{t.sizeCode ?? "Total"}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink-900">{(t.qtyOut || t.qtyIn).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </AccentCard>
        </>
      )}
    </div>
  );
}

const STAT_TONE_CLASSES: Record<IconTone, string> = {
  sky: "border-sky-200 bg-gradient-to-br from-sky-50 to-white",
  amber: "border-amber-300 bg-gradient-to-br from-amber-50 to-white",
  emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
  violet: "border-violet-200 bg-gradient-to-br from-violet-50 to-white",
  rose: "border-rose-200 bg-gradient-to-br from-rose-50 to-white",
  slate: "border-slate-200 bg-gradient-to-br from-slate-50 to-white",
};

const STAT_TEXT_CLASSES: Record<IconTone, string> = {
  sky: "text-sky-700",
  amber: "text-amber-600",
  emerald: "text-emerald-700",
  violet: "text-violet-700",
  rose: "text-rose-700",
  slate: "text-ink-900",
};

function RefStat({ label, value, unit, tone = "slate" }: { label: string; value: number; unit: string; tone?: IconTone }) {
  return (
    <div className={`rounded-lg border p-3 shadow-[0_4px_12px_-8px_rgba(15,23,42,0.3)] transition-transform duration-150 hover:-translate-y-0.5 ${STAT_TONE_CLASSES[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${STAT_TEXT_CLASSES[tone]}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] font-medium text-ink-400">{unit}</p>
    </div>
  );
}
