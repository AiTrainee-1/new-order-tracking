import { buildLotJourney, buildOutputSummary, buildSizeOutput, type ProductionChain } from "./chain";
import { formatDisplayDate } from "./workflow";
import type { Order, PublicAppUser, PurchaseOrder } from "./types";

/**
 * Production summary export.
 *
 * Both formats are built from the same set of tables so the spreadsheet and the
 * PDF can never tell different stories - the only difference is presentation.
 * Every figure comes from the chain, which comes from the ledgers, so an export
 * is always a snapshot of the real entries rather than a separately-maintained
 * report.
 *
 * xlsx and jsPDF are imported dynamically: together they're most of a megabyte,
 * and only this one screen ever needs them. Loading them on demand keeps them
 * out of the bundle every floor operator downloads to enter a day's output.
 */

export interface ReportContext {
  order: Order;
  po: PurchaseOrder | null;
  chain: ProductionChain;
  usersById: Map<string, PublicAppUser>;
}

type Row = (string | number)[];

interface ReportTable {
  name: string;
  head: string[];
  rows: Row[];
}

function scopeLabel(ctx: ReportContext): string {
  return ctx.po ? `PO ${ctx.po.poNumber}` : "All POs (combined)";
}

function buildTables(ctx: ReportContext): ReportTable[] {
  const { order, chain } = ctx;
  const summary = buildOutputSummary(chain);
  const tables: ReportTable[] = [];

  // --- Order header --------------------------------------------------------
  tables.push({
    name: "Order Summary",
    head: ["Field", "Value"],
    rows: [
      ["IO / No", order.ioNo],
      ["Style", order.style],
      ["Description", order.description ?? "-"],
      ["Colour", order.color ?? "-"],
      ["Fabric", order.fabric ?? "-"],
      ["Scope", scopeLabel(ctx)],
      ["Delivery date", formatDisplayDate(order.deliveryDate)],
      ["Ordered (PCS)", summary.orderedPcs],
      ["Cut (PCS)", summary.cutPcs],
      ["Packed (PCS)", summary.packedPcs],
      ["Shortfall (PCS)", summary.shortfallPcs],
      ["Total rejected (PCS)", summary.totalRejectedPcs],
      ["Overall efficiency (%)", summary.overallEfficiencyPct ?? "-"],
      ["Fabric planned (KG)", summary.fabricPlannedKg],
      ["Fabric reached store (KG)", summary.fabricInhouseKg],
      ["Fabric process loss (KG)", summary.fabricLossKg],
      ["Report generated", new Date().toLocaleString()],
    ],
  });

  // --- Size-wise PO breakdown ----------------------------------------------
  tables.push({
    name: "Size-wise Quantity",
    head: ["Size", "Ordered", "Cut", "Sewn", "Packed", "Balance"],
    // sewn/packed/balance are null once that stage records one overall figure
    // instead of a size breakdown - printed as "-", not a misleading 0.
    rows: buildSizeOutput(chain).map((s) => [s.sizeCode, s.ordered, s.cut, s.sewn ?? "-", s.packed ?? "-", s.balance ?? "-"]),
  });

  // --- Stage-by-stage loss analysis ----------------------------------------
  tables.push({
    name: "Stage Analysis",
    head: ["Stage", "Unit", "Input", "Output", "Rejected", "Shortage", "Efficiency %"],
    rows: summary.rows.map((r) => [r.label, r.unit, r.input, r.output, r.rejected, r.shortage, r.efficiencyPct ?? "-"]),
  });

  // --- Material / procurement ----------------------------------------------
  // Required → Planned → Received → Balance, matching what the Inward screen
  // and the dashboard show.
  tables.push({
    name: "Raw Material",
    head: ["Material", "Type", "Required KG", "Planned KG", "Received KG", "Balance KG", "Status"],
    rows: chain.requirementFlows.map((f) => [
      f.requirement.name,
      f.requirement.category,
      f.totals.required,
      f.plannedQty,
      f.receivedQty,
      f.balance,
      f.balance === 0 && f.receivedQty > 0 ? "Full" : f.receivedQty > 0 ? "Partial" : "Pending",
    ]),
  });

  // --- Lot traceability ----------------------------------------------------
  const lotRows: Row[] = [];
  for (const lot of chain.lots) {
    const journey = buildLotJourney(lot, chain);
    for (const step of journey.steps) {
      lotRows.push([lot.lotNo, step.stage.label, step.unit, step.qtyIn, step.qtyOut, step.qtyRejected, step.loss]);
    }
  }
  tables.push({
    name: "Lot Traceability",
    head: ["Lot", "Stage", "Unit", "In", "Out", "Rejected", "Loss"],
    rows: lotRows,
  });

  // --- Every transaction ---------------------------------------------------
  const stageLabelById = new Map(chain.stages.map((s) => [s.stage.id, s.stage.label]));
  const lotNoById = new Map(chain.lots.map((l) => [l.id, l.lotNo]));
  const txnRows: Row[] = chain.stages
    .flatMap((s) => s.txns)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate))
    .map((t) => [
      formatDisplayDate(t.entryDate),
      stageLabelById.get(t.sectionId) ?? "-",
      t.lotId ? (lotNoById.get(t.lotId) ?? "-") : "-",
      t.sizeCode ?? "-",
      t.unit,
      t.qtyIn,
      t.qtyOut,
      t.qtyRejected,
      t.refName ?? "-",
      t.docNo ?? "-",
      ctx.usersById.get(t.enteredBy)?.name ?? "-",
      t.notes ?? "",
    ]);
  tables.push({
    name: "All Entries",
    head: ["Date", "Stage", "Lot", "Size", "Unit", "In", "Out", "Rejected", "Ref", "Doc", "By", "Notes"],
    rows: txnRows,
  });

  return tables;
}

function fileBase(ctx: ReportContext): string {
  const scope = ctx.po ? `PO${ctx.po.poNumber}` : "AllPOs";
  return `${ctx.order.style}_${scope}_production-summary`.replace(/[^\w.-]+/g, "_");
}

export async function exportExcel(ctx: ReportContext): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const table of buildTables(ctx)) {
    const sheet = XLSX.utils.aoa_to_sheet([table.head, ...table.rows]);
    // Widths come from the header plus the widest cell so long stage names and
    // notes aren't delivered as ####.
    sheet["!cols"] = table.head.map((h, i) => ({
      wch: Math.min(48, Math.max(h.length + 2, ...table.rows.map((r) => String(r[i] ?? "").length + 2), 10)),
    }));
    // Excel caps sheet names at 31 characters.
    XLSX.utils.book_append_sheet(workbook, sheet, table.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, `${fileBase(ctx)}.xlsx`);
}

export async function exportPdf(ctx: ReportContext): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const tables = buildTables(ctx);

  doc.setFontSize(16);
  doc.text("Production Summary", 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${ctx.order.style} · IO ${ctx.order.ioNo} · ${scopeLabel(ctx)} · generated ${new Date().toLocaleString()}`, 40, 58);
  doc.setTextColor(0);

  let cursorY = 78;

  for (const table of tables) {
    if (table.rows.length === 0) continue;

    // Start a fresh page if there isn't room for the heading plus a few rows -
    // a section title stranded at the foot of a page reads as a mistake.
    if (cursorY > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      cursorY = 50;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(table.name, 40, cursorY);
    doc.setFont("helvetica", "normal");
    cursorY += 10;

    autoTable(doc, {
      head: [table.head],
      body: table.rows.map((r) => r.map((c) => String(c))),
      startY: cursorY,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [21, 94, 239], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 252] },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY;
    cursorY = finalY + 30;
  }

  doc.save(`${fileBase(ctx)}.pdf`);
}

/** CSV of the stage analysis - the one table people paste into email. */
export function exportCsv(ctx: ReportContext): void {
  const table = buildTables(ctx).find((t) => t.name === "Stage Analysis")!;
  const csv = [table.head, ...table.rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileBase(ctx)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
