"use client";

import { Fragment, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/FormControls";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { StagePlanPicker, type StagePlanValue } from "@/components/forms/StagePlanPicker";
import { useStageDefinitions, useStagePlanTemplates } from "@/hooks/useStageDefinitions";
import { applyExtraPercent, DEFAULT_SIZE_TEMPLATE, sortSizes } from "@/lib/sizes";
import { validateStagePlan } from "@/lib/stagePlan";
import { iconGradient, type IconTone } from "@/lib/theme";
import type { Order, PoSizeQuantity, PurchaseOrder } from "@/lib/types";
import type { OrderFormInput, OrderPoInput } from "@/hooks/useOrderMutations";

/**
 * Order creation, laid out the way the buying sheet is: sizes across the
 * top, one row per PO, quantities in the grid - plus the stage-plan picker,
 * new in this rewrite (see StagePlanPicker).
 *
 * The size columns belong to the ORDER, not to each PO - a style is cut in
 * one size set, and every PO of it ships some of each. PO totals and the
 * order total are computed, never typed - the number and its breakdown then
 * cannot drift apart.
 */

let rowSeq = 0;

interface PoRow {
  key: string;
  poNumber: string;
  deliveryDate: string | null;
  /** size code → quantity, held as strings so a cleared cell stays cleared
   * instead of snapping back to 0 while being typed. */
  qty: Record<string, string>;
  /** % added on top of the buyer's quantity to get the production quantity.
   * Held as a string for the same reason `qty` is. */
  extraPercent: string;
}

function emptyRow(): PoRow {
  rowSeq += 1;
  return { key: `new-${rowSeq}`, poNumber: "", deliveryDate: "", qty: {}, extraPercent: "0" };
}

function rowTotal(row: PoRow, sizes: string[]): number {
  return sizes.reduce((total, code) => total + (Number(row.qty[code]) || 0), 0);
}

function productionQty(row: PoRow, code: string): number {
  return applyExtraPercent(Number(row.qty[code]) || 0, Number(row.extraPercent) || 0);
}

function rowProductionTotal(row: PoRow, sizes: string[]): number {
  return sizes.reduce((total, code) => total + productionQty(row, code), 0);
}

const EMPTY_STAGE_PLAN: StagePlanValue = {
  selectedIds: [],
  sizeOriginStageDefinitionId: null,
  lotOriginStageDefinitionId: null,
};

export function OrderForm({
  initialOrder,
  initialPurchaseOrders,
  initialSizes,
  existingImageUrl,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  initialOrder?: Order;
  initialPurchaseOrders?: PurchaseOrder[];
  initialSizes?: PoSizeQuantity[];
  existingImageUrl?: string | null;
  onSubmit: (input: OrderFormInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ioNo, setIoNo] = useState(initialOrder?.ioNo ?? "");
  const [style, setStyle] = useState(initialOrder?.style ?? "");
  const [description, setDescription] = useState(initialOrder?.description ?? "");
  const [color, setColor] = useState(initialOrder?.color ?? "");
  const [fabric, setFabric] = useState(initialOrder?.fabric ?? "");
  const [deliveryDate, setDeliveryDate] = useState(initialOrder?.deliveryDate ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(existingImageUrl ?? null);
  const [stagePlan, setStagePlan] = useState<StagePlanValue>(EMPTY_STAGE_PLAN);

  const { data: catalog } = useStageDefinitions();
  const { data: templates } = useStagePlanTemplates();

  const [sizes, setSizes] = useState<string[]>(() => {
    const existing = sortSizes(initialSizes ?? []).map((s) => s.sizeCode);
    const unique = Array.from(new Set(existing));
    return unique.length ? unique : [...DEFAULT_SIZE_TEMPLATE];
  });

  const [poRows, setPoRows] = useState<PoRow[]>(() => {
    if (!initialPurchaseOrders?.length) return [emptyRow()];
    return initialPurchaseOrders.map((po) => {
      const qty: Record<string, string> = {};
      for (const s of initialSizes ?? []) {
        if (s.poId === po.id) qty[s.sizeCode] = String(s.quantity);
      }
      return {
        key: po.id,
        poNumber: po.poNumber,
        deliveryDate: po.deliveryDate,
        qty,
        extraPercent: String(po.extraPercent ?? 0),
      };
    });
  });

  const [newSize, setNewSize] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ ioNo?: string; style?: string; purchaseOrders?: string }>({});

  const orderTotal = poRows.reduce((total, r) => total + rowTotal(r, sizes), 0);
  const orderProductionTotal = poRows.reduce((total, r) => total + rowProductionTotal(r, sizes), 0);

  function updateRow(key: string, patch: Partial<Omit<PoRow, "qty">>) {
    setPoRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateQty(key: string, sizeCode: string, value: string) {
    setPoRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, qty: { ...r.qty, [sizeCode]: value } } : r)),
    );
  }

  function addSize() {
    const code = newSize.trim().toUpperCase();
    if (!code || sizes.includes(code)) return;
    setSizes((prev) => [...prev, code]);
    setNewSize("");
  }

  function removeSize(code: string) {
    setSizes((prev) => (prev.length > 1 ? prev.filter((s) => s !== code) : prev));
    setPoRows((prev) =>
      prev.map((r) => {
        const { [code]: _dropped, ...rest } = r.qty;
        return { ...r, qty: rest };
      }),
    );
  }

  function handleImageSelect(file: File | null) {
    setImageFile(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const purchaseOrders: OrderPoInput[] = poRows.map((r) => {
      const sizeRows = sizes
        .map((code) => ({ sizeCode: code, quantity: Number(r.qty[code]) || 0 }))
        .filter((s) => s.quantity > 0);
      return {
        poNumber: r.poNumber,
        quantity: rowTotal(r, sizes),
        deliveryDate: r.deliveryDate || null,
        sizes: sizeRows,
        extraPercent: Number(r.extraPercent) || 0,
      };
    });

    // Caught here, per field, instead of letting an incomplete form reach
    // the server - a 400 there can only ever say "purchase order missing"
    // or "stage plan invalid" in general, not point back at which row/input
    // to fix.
    const errors: typeof fieldErrors = {};
    if (!ioNo.trim()) errors.ioNo = "Enter the IO / No.";
    if (!style.trim()) errors.style = "Enter a style name.";
    const hasRealPo = purchaseOrders.some((po) => po.poNumber.trim() && po.quantity > 0);
    if (!hasRealPo) {
      errors.purchaseOrders = "Add a PO Number and a quantity in at least one size, for at least one purchase order below.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // The stage-plan picker already shows its own live, specific validation
    // message inline - this just stops submission while that's unresolved,
    // rather than duplicating the same text a second time here.
    if (catalog) {
      const stagePlanValidation = validateStagePlan(
        {
          stages: stagePlan.selectedIds.map((id, i) => ({ stageDefinitionId: id, seq: i + 1 })),
          sizeOriginStageDefinitionId: stagePlan.sizeOriginStageDefinitionId,
          lotOriginStageDefinitionId: stagePlan.lotOriginStageDefinitionId,
        },
        catalog,
      );
      if (!stagePlanValidation.ok) return;
    }

    onSubmit({
      ioNo,
      style,
      description,
      color,
      fabric,
      deliveryDate: deliveryDate || null,
      imageFile,
      purchaseOrders,
      stagePlan,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex animate-fadeInUp gap-4 rounded-2xl border border-white/70 bg-gradient-to-br from-white/80 to-indigo-50/60 p-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-indigo-200 bg-white shadow-[0_8px_20px_-12px_rgba(21,94,239,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_12px_28px_-10px_rgba(21,94,239,0.45)]"
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a static asset.
            <img src={imagePreview} alt="Garment preview" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
          ) : (
            <GarmentPlaceholder className="h-9 w-9 text-indigo-300 transition-colors group-hover:text-brand" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-ink-950/0 text-[11px] font-medium text-transparent transition-colors group-hover:bg-ink-950/55 group-hover:text-white">
            {imagePreview ? "Change" : "Upload"}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleImageSelect(e.target.files?.[0] ?? null)}
        />
        <div className="flex-1 space-y-1 self-center">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
            <span aria-hidden>🖼️</span> Garment / Product Image
          </p>
          <p className="text-xs text-ink-500">
            Used across the dashboard, order details, assignments, and data-entry screens for
            quick identification.
          </p>
        </div>
      </div>

      <FormSection icon="📝" iconTone="violet" title="Garment Details" subtitle="The core information every other screen shows for this order.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="IO / No" value={ioNo} onChange={(e) => setIoNo(e.target.value)} error={fieldErrors.ioNo} required />
          <Input label="Style Name" value={style} onChange={(e) => setStyle(e.target.value)} error={fieldErrors.style} required />
          <Input label="Color" value={color} onChange={(e) => setColor(e.target.value)} />
          <Input
            label="Overall Delivery Date"
            type="date"
            value={deliveryDate ?? ""}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>

        <Textarea label="Description" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        <Input
          label="Fabric"
          value={fabric ?? ""}
          onChange={(e) => setFabric(e.target.value)}
          placeholder="e.g. Brushed Back Fleece 60% BCI Cotton 40% Recycled Poly - 280GSM"
        />
      </FormSection>

      <FormSection icon="📏" iconTone="amber" title="Size Set" subtitle="The sizes this style is made in - every PO below breaks down across these, and every PCS stage in this order's plan tracks against them.">
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-white p-3">
          <div className="mb-2 flex flex-wrap items-end justify-end gap-2">
            <Input
              label="Add size"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSize();
                }
              }}
              placeholder="e.g. 3XL"
              className="w-28"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addSize} className="mb-0.5">
              + Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((code) => (
              <span
                key={code}
                className="group inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-[0_2px_8px_-4px_rgba(217,119,6,0.3)] transition-transform duration-150 hover:-translate-y-0.5"
              >
                {code}
                <button
                  type="button"
                  onClick={() => removeSize(code)}
                  className="text-amber-400 transition-colors hover:text-status-bad"
                  aria-label={`Remove size ${code}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection
        icon="🧾"
        iconTone="emerald"
        title="Purchase Orders"
        subtitle="Enter the buyer's ordered quantity per size. Extra % adds the factory's production margin on top."
        action={
          <div className="text-right text-xs">
            <p className="font-semibold text-ink-700">Buyer order total: {orderTotal.toLocaleString()} PCS</p>
            <p className="font-semibold text-brand">Production total: {orderProductionTotal.toLocaleString()} PCS</p>
          </div>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-ink-100 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.3)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-50 to-emerald-50 text-[11px] uppercase tracking-wide text-ink-500">
                <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">PO Number</th>
                {sizes.map((code) => (
                  <th key={code} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
                    {code}
                  </th>
                ))}
                <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Total</th>
                <th className="whitespace-nowrap px-2 py-2 text-center font-semibold">Extra %</th>
                <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">Delivery</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {poRows.map((row) => (
                <Fragment key={row.key}>
                  <tr className="bg-white transition-colors hover:bg-indigo-50/40">
                    <td className="px-2 py-1.5">
                      <input
                        value={row.poNumber}
                        onChange={(e) => updateRow(row.key, { poNumber: e.target.value })}
                        placeholder="01669678"
                        className={`w-32 rounded-lg border px-2 py-1.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                          fieldErrors.purchaseOrders && (!row.poNumber.trim() || rowTotal(row, sizes) === 0) ? "border-status-bad" : "border-ink-200"
                        }`}
                      />
                    </td>
                    {sizes.map((code) => (
                      <td key={code} className="px-1 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={row.qty[code] ?? ""}
                          onChange={(e) => updateQty(row.key, code, e.target.value)}
                          className="w-20 rounded-lg border border-ink-200 px-2 py-1.5 text-center text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right text-sm font-bold tabular-nums text-ink-900">
                      {rowTotal(row, sizes).toLocaleString()}
                    </td>
                    <td className="px-1 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={row.extraPercent}
                        onChange={(e) => updateRow(row.key, { extraPercent: e.target.value })}
                        className="w-16 rounded-lg border border-ink-200 px-2 py-1.5 text-center text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={row.deliveryDate ?? ""}
                        onChange={(e) => updateRow(row.key, { deliveryDate: e.target.value })}
                        className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-status-bad hover:bg-red-50"
                        onClick={() =>
                          setPoRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))
                        }
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                  <tr key={`${row.key}-production`} className="bg-gradient-to-r from-blue-50/80 to-indigo-50/50">
                    <td className="px-2 py-1 text-xs font-bold text-brand">+{Number(row.extraPercent) || 0}%</td>
                    {sizes.map((code) => (
                      <td key={code} className="px-2 py-1 text-center text-xs font-bold tabular-nums text-brand">
                        {productionQty(row, code).toLocaleString()}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right text-xs font-bold tabular-nums text-brand">
                      {rowProductionTotal(row, sizes).toLocaleString()}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 text-xs font-bold text-ink-800">
                <td className="px-2 py-2">Buyer Total</td>
                {sizes.map((code) => (
                  <td key={code} className="px-2 py-2 text-center tabular-nums">
                    {poRows
                      .reduce((total, r) => total + (Number(r.qty[code]) || 0), 0)
                      .toLocaleString()}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums">{orderTotal.toLocaleString()}</td>
                <td colSpan={3} />
              </tr>
              <tr className="bg-gradient-to-r from-blue-50 to-indigo-100/60 text-xs font-bold text-brand">
                <td className="px-2 py-2">Production Total</td>
                {sizes.map((code) => (
                  <td key={code} className="px-2 py-2 text-center tabular-nums">
                    {poRows
                      .reduce((total, r) => total + productionQty(r, code), 0)
                      .toLocaleString()}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums">{orderProductionTotal.toLocaleString()}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={() => setPoRows((p) => [...p, emptyRow()])} className="mt-2">
          + Add PO
        </Button>
        {fieldErrors.purchaseOrders && <p className="mt-2 text-xs font-medium text-status-bad">{fieldErrors.purchaseOrders}</p>}
      </FormSection>

      {/* ---------------------------------------------------------------- */}
      {/* Stage plan                                                        */}
      {/* ---------------------------------------------------------------- */}
      {catalog && (
        <FormSection icon="🔗" iconTone="rose" title="Stage Plan" subtitle="Pick and order the stages this order will flow through.">
          <StagePlanPicker
            catalog={catalog}
            templates={templates ?? []}
            value={stagePlan}
            onChange={setStagePlan}
          />
        </FormSection>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-status-bad">{error}</p>
      )}

      <div className="-mx-6 -mb-5 flex justify-end gap-2 rounded-b-2xl border-t border-white/70 bg-gradient-to-r from-indigo-50/70 to-white/70 px-6 py-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          {initialOrder ? "Save Changes" : "Create Order"}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  icon,
  iconTone,
  title,
  subtitle,
  action,
  children,
}: {
  icon: string;
  iconTone: IconTone;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="animate-fadeInUp space-y-4 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_8px_20px_-16px_rgba(15,23,42,0.25)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm shadow-[0_6px_14px_-6px_rgba(15,23,42,0.4)]" style={iconGradient[iconTone]}>
            {icon}
          </span>
          <div>
            <p className="text-sm font-bold text-ink-800">{title}</p>
            {subtitle && <p className="max-w-md text-[11px] text-ink-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
