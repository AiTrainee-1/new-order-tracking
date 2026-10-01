import type { ActivityRecord, DateRange, TrackingOrder } from "./trackingHistory";
import { TRACKING_STATUS_LABEL, entriesInRange, rangeLabel, shortDate, shortDateTime, stagesUpdatedInRange, toDateKey, type TrackingStageStatus } from "./trackingHistory";
import type { OrderActivitySummary, SequencedRecord, StageActivitySummary, TodayVsYesterday, UserActivitySummary } from "./trackingActivity";

/**
 * Tracking History exports - PNG and Excel, for all six report types. Both
 * formats are built from exactly the rows the screen is showing (after its
 * own filters), via the single `exportTrackingReport` dispatcher below, so a
 * report always matches the view it was exported from.
 *
 * PNG: drawn on a canvas whose size is COMPUTED from the actual content
 * (measured column widths, exact row counts) rather than guessed - there is
 * no fixed page size to leave blank. See `measureColumns`/`drawTable`.
 *
 * Excel: built with exceljs (dynamic import - it and its canvas drawing
 * counterpart are only needed once this button is pressed). Plain `xlsx`
 * (used elsewhere in this app, e.g. lib/reportExport.ts) cannot write cell
 * styles or freeze panes in this project's installed version - verified
 * empirically, not assumed - so this module uses exceljs instead, which
 * genuinely supports the bold/coloured headers, frozen header row and
 * autofilter this report needs to look professional.
 */

export const BRAND = "#155EEF";
export const BRAND_RGB = "FF155EEF";
const GOOD_RGB = "FF12B655";
const BAD_RGB = "FFE11D48";
export const INK_RGB = "FF1E293B";
export const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
export const MAX_CANVAS_PX = 16000;

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filename stamp in the browser's own LOCAL date - slicing the ISO
 *  (UTC) string directly would show the wrong day for every timezone ahead
 *  of UTC (e.g. a local "1 October" range would come out "2026-09-30"). */
function stamp(range?: DateRange): string {
  if (!range) return toDateKey(new Date());
  const a = toDateKey(new Date(range.fromISO));
  const b = toDateKey(new Date(range.toISO));
  return a === b ? a : `${a}_to_${b}`;
}

// ---------------------------------------------------------------------------
// Cell model shared by the PNG table drawer and (loosely) the Excel writer
// ---------------------------------------------------------------------------

export interface Cell {
  text: string;
  align?: "left" | "right" | "center";
  color?: string;
  bold?: boolean;
  /** Absolute URL - drawn as brand-coloured underlined text in the PNG
   *  (a flattened image can't be clickable); written as a real clickable
   *  cell hyperlink in Excel. */
  hyperlink?: string;
}
export type CellInput = string | number | Cell;

export function cellOf(v: CellInput): Cell {
  return typeof v === "object" ? v : { text: String(v) };
}

export interface TableColumn {
  header: string;
  align?: "left" | "right" | "center";
  /** Character-count hint for Excel's column width when there's no row data yet. */
  minChars?: number;
}

export interface TableSpec {
  heading?: string;
  columns: TableColumn[];
  rows: CellInput[][];
}

export interface ReportSpec {
  title: string;
  /** e.g. the resolved date range, shown under the title. */
  subtitle: string;
  /** Active filters, e.g. "Buyer: H&M · User: All · Stage: All". */
  filterSummary: string;
  kpis: { label: string; value: string }[];
  tables: TableSpec[];
}

// ---------------------------------------------------------------------------
// PNG - generic measure + draw, used by every report except Final Order
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null;
export function measurer(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    c.width = 10;
    c.height = 10;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't create a canvas.");
    measureCtx = ctx;
  }
  return measureCtx;
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export const CELL_PAD_X = 14;
const MIN_COL_W = 70;
const MAX_COL_W = 340;

/** Column widths that exactly fit the header + every cell in that column -
 *  the single thing that kills unnecessary blank space in the PNG. Measures
 *  at EXACTLY the font drawTable's header/row loops actually draw with
 *  (including each cell's own bold state) - measuring at a different size
 *  or weight than the real draw is what let "Raw Material Planning" and
 *  similar longer labels measure as fitting and then truncate anyway. */
export function measureColumns(columns: TableColumn[], rows: CellInput[][]): number[] {
  const ctx = measurer();
  return columns.map((col, i) => {
    ctx.font = "700 12px " + FONT;
    let max = ctx.measureText(col.header).width;
    for (const row of rows) {
      const cell = cellOf(row[i] ?? "");
      ctx.font = `${cell.bold ? 700 : 500} 12.5px ${FONT}`;
      const w = ctx.measureText(cell.text).width;
      if (w > max) max = w;
    }
    return Math.min(Math.max(max + CELL_PAD_X * 2, MIN_COL_W), MAX_COL_W);
  });
}

const ROW_H = 27;
const HEAD_H = 30;
const SECTION_HEAD_H = 26;

export function tableHeight(t: TableSpec): number {
  return (t.heading ? SECTION_HEAD_H : 0) + HEAD_H + t.rows.length * ROW_H;
}

export function drawTable(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, colWidths: number[], t: TableSpec): number {
  let cy = y;
  if (t.heading) {
    ctx.fillStyle = "#EEF2FF";
    ctx.fillRect(x, cy, width, SECTION_HEAD_H);
    ctx.fillStyle = "#3730A3";
    ctx.font = "700 12px " + FONT;
    ctx.textAlign = "left";
    ctx.fillText(t.heading.toUpperCase(), x + CELL_PAD_X, cy + 17);
    cy += SECTION_HEAD_H;
  }

  // Header
  ctx.fillStyle = BRAND;
  ctx.fillRect(x, cy, width, HEAD_H);
  let cx = x;
  ctx.font = "700 12px " + FONT;
  ctx.fillStyle = "#FFFFFF";
  t.columns.forEach((col, i) => {
    const w = colWidths[i];
    ctx.textAlign = col.align === "right" ? "right" : col.align === "center" ? "center" : "left";
    const tx = ctx.textAlign === "right" ? cx + w - CELL_PAD_X : ctx.textAlign === "center" ? cx + w / 2 : cx + CELL_PAD_X;
    ctx.fillText(fitText(ctx, col.header, w - CELL_PAD_X * 2), tx, cy + 20);
    cx += w;
  });
  cy += HEAD_H;

  // Rows
  t.rows.forEach((row, ri) => {
    if (ri % 2 === 1) {
      ctx.fillStyle = "#F8FAFC";
      ctx.fillRect(x, cy, width, ROW_H);
    }
    cx = x;
    ctx.font = "500 12.5px " + FONT;
    row.forEach((raw, ci) => {
      const col = t.columns[ci];
      const w = colWidths[ci] ?? MIN_COL_W;
      const cell = cellOf(raw);
      const align = cell.align ?? col?.align ?? "left";
      ctx.textAlign = align === "right" ? "right" : align === "center" ? "center" : "left";
      ctx.fillStyle = cell.color ?? (cell.hyperlink ? BRAND : "#1E293B");
      ctx.font = `${cell.bold ? 700 : 500} 12.5px ${FONT}`;
      const tx = ctx.textAlign === "right" ? cx + w - CELL_PAD_X : ctx.textAlign === "center" ? cx + w / 2 : cx + CELL_PAD_X;
      const shown = fitText(ctx, cell.text, w - CELL_PAD_X * 2);
      ctx.fillText(shown, tx, cy + 18);
      if (cell.hyperlink) {
        const tw = ctx.measureText(shown).width;
        const lx = ctx.textAlign === "right" ? tx - tw : ctx.textAlign === "center" ? tx - tw / 2 : tx;
        ctx.strokeStyle = BRAND;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, cy + 20.5);
        ctx.lineTo(lx + tw, cy + 20.5);
        ctx.stroke();
      }
      cx += w;
    });
    cy += ROW_H;
  });

  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, cy - y - 1);
  ctx.textAlign = "left";
  return cy - y;
}

export const PAGE_MARGIN = 28;
const TITLE_H = 38;
const SUBTITLE_H = 44;
const KPI_H = 58;
const GAP = 16;

/** Renders a title + KPI strip + N stacked tables, sized to exactly its
 *  content - used by every report type except the Final Order Report's own
 *  per-order card grid (see renderFinalOrderPng). */
async function renderTablesPng(spec: ReportSpec): Promise<Blob> {
  const colWidthsPerTable = spec.tables.map((t) => measureColumns(t.columns, t.rows));
  const tableWidths = colWidthsPerTable.map((ws) => ws.reduce((a, b) => a + b, 0));
  const pageWidth = Math.max(760, ...tableWidths) + PAGE_MARGIN * 2;

  const kpiRowH = spec.kpis.length > 0 ? KPI_H : 0;
  const tablesH = spec.tables.reduce((sum, t) => sum + tableHeight(t) + GAP, 0);
  const emptyNote = spec.tables.every((t) => t.rows.length === 0) ? 36 : 0;
  const pageHeight = PAGE_MARGIN * 2 + TITLE_H + SUBTITLE_H + kpiRowH + tablesH + emptyNote;

  if (pageHeight > MAX_CANVAS_PX || pageWidth > MAX_CANVAS_PX) {
    throw new Error("This report is too large for one PNG - narrow the filters or export Excel instead.");
  }
  const scale = pageHeight * 2 > MAX_CANVAS_PX || pageWidth * 2 > MAX_CANVAS_PX ? 1 : 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(pageWidth * scale);
  canvas.height = Math.ceil(pageHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't create the image.");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#F1F5F9";
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  let y = PAGE_MARGIN;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0F172A";
  ctx.font = "800 22px " + FONT;
  ctx.textAlign = "left";
  ctx.fillText(spec.title, PAGE_MARGIN, y + 20);
  ctx.font = "600 11px " + FONT;
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "right";
  ctx.fillText(`Generated ${new Date().toLocaleString("en-GB")}`, pageWidth - PAGE_MARGIN, y + 16);
  ctx.textAlign = "left";
  y += TITLE_H;

  ctx.font = "700 13px " + FONT;
  ctx.fillStyle = BRAND;
  ctx.fillText(spec.subtitle, PAGE_MARGIN, y + 14);
  ctx.font = "500 11.5px " + FONT;
  ctx.fillStyle = "#64748B";
  ctx.fillText(fitText(ctx, spec.filterSummary, pageWidth - PAGE_MARGIN * 2), PAGE_MARGIN, y + 32);
  y += SUBTITLE_H;

  if (spec.kpis.length > 0) {
    const chipW = (pageWidth - PAGE_MARGIN * 2) / spec.kpis.length;
    spec.kpis.forEach((k, i) => {
      const cx = PAGE_MARGIN + i * chipW;
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#E2E8F0";
      ctx.beginPath();
      const rr = 8;
      const bw = chipW - 8;
      const bh = KPI_H - 10;
      const bx = cx;
      const by = y;
      ctx.moveTo(bx + rr, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, rr);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, rr);
      ctx.arcTo(bx, by + bh, bx, by, rr);
      ctx.arcTo(bx, by, bx + bw, by, rr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = "600 10.5px " + FONT;
      ctx.fillStyle = "#64748B";
      ctx.fillText(fitText(ctx, k.label.toUpperCase(), bw - 16), bx + 10, by + 20);
      ctx.font = "800 17px " + FONT;
      ctx.fillStyle = "#0F172A";
      ctx.fillText(fitText(ctx, k.value, bw - 16), bx + 10, by + 42);
    });
    y += KPI_H;
  }

  for (let i = 0; i < spec.tables.length; i++) {
    const t = spec.tables[i];
    if (t.rows.length === 0) continue;
    const colWidths = colWidthsPerTable[i];
    const w = tableWidths[i];
    drawTable(ctx, PAGE_MARGIN, y, w, colWidths, t);
    y += tableHeight(t) + GAP;
  }
  if (spec.tables.every((t) => t.rows.length === 0)) {
    ctx.font = "500 14px " + FONT;
    ctx.fillStyle = "#64748B";
    ctx.fillText("No data matches these filters.", PAGE_MARGIN, y + 20);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  return blob;
}

// ---------------------------------------------------------------------------
// Excel - generic workbook builder (exceljs)
// ---------------------------------------------------------------------------

async function buildWorkbook(sheets: { name: string; spec: ReportSpec }[]) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "UK Textiles - Order Tracker";
  wb.created = new Date();

  for (const { name, spec } of sheets) {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [] });
    const maxCols = Math.max(1, ...spec.tables.map((t) => t.columns.length));

    ws.mergeCells(1, 1, 1, maxCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = spec.title;
    titleCell.font = { bold: true, size: 15, color: { argb: INK_RGB } };
    ws.getRow(1).height = 26;

    ws.mergeCells(2, 1, 2, maxCols);
    const subCell = ws.getCell(2, 1);
    subCell.value = `${spec.subtitle}  |  ${spec.filterSummary}`;
    subCell.font = { italic: true, size: 10, color: { argb: "FF64748B" } };

    let r = 4;
    if (spec.kpis.length > 0) {
      ws.getRow(r).values = spec.kpis.map((k) => k.label);
      ws.getRow(r).font = { bold: true, size: 9, color: { argb: "FF64748B" } };
      r += 1;
      ws.getRow(r).values = spec.kpis.map((k) => k.value);
      ws.getRow(r).font = { bold: true, size: 12, color: { argb: INK_RGB } };
      r += 2;
    }

    const singleTable = spec.tables.length === 1;
    for (const t of spec.tables) {
      if (t.heading) {
        ws.mergeCells(r, 1, r, maxCols);
        const h = ws.getCell(r, 1);
        h.value = t.heading;
        h.font = { bold: true, size: 11, color: { argb: "FF3730A3" } };
        h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
        for (let c = 1; c <= maxCols; c++) ws.getCell(r, c).fill = h.fill;
        r += 1;
      }

      const headerRowIdx = r;
      const headerRow = ws.getRow(headerRowIdx);
      t.columns.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = col.header;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RGB } };
        cell.alignment = { vertical: "middle", horizontal: col.align ?? "left" };
      });
      headerRow.height = 20;
      r += 1;

      for (const row of t.rows) {
        const excelRow = ws.getRow(r);
        row.forEach((raw, i) => {
          const cell = cellOf(raw);
          const target = excelRow.getCell(i + 1);
          target.value = cell.text;
          target.alignment = { horizontal: cell.align ?? t.columns[i]?.align ?? "left" };
          if (cell.bold) target.font = { bold: true };
          if (cell.color === GOOD_COLOR) target.font = { ...(target.font ?? {}), color: { argb: GOOD_RGB } };
          else if (cell.color === BAD_COLOR) target.font = { ...(target.font ?? {}), color: { argb: BAD_RGB } };
        });
        r += 1;
      }

      if (singleTable && t.rows.length > 0) {
        ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx + t.rows.length, column: maxCols } };
        ws.views = [{ state: "frozen", ySplit: headerRowIdx, xSplit: 0 }];
      }
      r += 2; // spacer before the next section, if any
    }

    ws.columns = Array.from({ length: maxCols }, (_, i) => {
      const header = spec.tables[0]?.columns[i]?.header ?? "";
      const allCells = spec.tables.flatMap((t) => t.rows.map((row) => cellOf(row[i] ?? "").text));
      const widestCell = allCells.reduce((max, c) => Math.max(max, c.length), 0);
      const hint = spec.tables[0]?.columns[i]?.minChars ?? 10;
      return { width: Math.min(Math.max(header.length, widestCell, hint) + 3, 48) };
    });
  }

  return wb;
}

// ---------------------------------------------------------------------------
// Shared bits: colours, KPI/table builders per report type
// ---------------------------------------------------------------------------

const GOOD_COLOR = "#12B655";
const BAD_COLOR = "#E11D48";

function diffCell(n: number): Cell {
  return { text: n > 0 ? `+${n}` : String(n), align: "right", bold: n !== 0, color: n > 0 ? GOOD_COLOR : n < 0 ? BAD_COLOR : "#94A3B8" };
}

const STATUS_COLOR: Record<TrackingStageStatus, string> = { completed: GOOD_COLOR, in_progress: "#B45309", not_started: "#94A3B8" };

// ---------------------------------------------------------------------------
// Report-specific specs
// ---------------------------------------------------------------------------

export interface ExportMeta {
  range?: DateRange;
  filterSummary: string;
}

function kpi(label: string, value: number | string): { label: string; value: string } {
  return { label, value: typeof value === "number" ? value.toLocaleString() : value };
}

function userWiseSpec(users: UserActivitySummary[], meta: ExportMeta): ReportSpec {
  return {
    title: "User-Wise Entry Report",
    subtitle: meta.range ? rangeLabel(meta.range) : "",
    filterSummary: meta.filterSummary,
    kpis: [kpi("Users", users.length), kpi("Total Entries", users.reduce((s, u) => s + u.totalEntries, 0))],
    tables: [
      {
        columns: [
          { header: "User" },
          { header: "Total Entries", align: "right" },
          { header: "Orders Handled", align: "right" },
          { header: "Stages Entered", align: "right" },
          { header: "First Entry" },
          { header: "Last Entry" },
        ],
        rows: users.map((u) => [u.userName, u.totalEntries, u.orderCount, u.stageCount, shortDateTime(u.firstEntryAt), shortDateTime(u.lastEntryAt)]),
      },
    ],
  };
}

function stageWiseSpec(stages: StageActivitySummary[], meta: ExportMeta): ReportSpec {
  return {
    title: "Stage-Wise Report",
    subtitle: meta.range ? rangeLabel(meta.range) : "",
    filterSummary: meta.filterSummary,
    kpis: [kpi("Stages With Activity", stages.length), kpi("Total Entries", stages.reduce((s, x) => s + x.totalEntries, 0))],
    tables: [
      {
        columns: [{ header: "Stage" }, { header: "Total Entries", align: "right" }, { header: "Orders", align: "right" }, { header: "Users", align: "right" }, { header: "Last Entry" }],
        rows: stages.map((s) => [s.stageLabel, s.totalEntries, s.orderCount, s.userCount, shortDateTime(s.lastEntryAt)]),
      },
    ],
  };
}

function orderWiseSpec(orders: OrderActivitySummary[], meta: ExportMeta): ReportSpec {
  return {
    title: "Order-Wise Report",
    subtitle: meta.range ? rangeLabel(meta.range) : "",
    filterSummary: meta.filterSummary,
    kpis: [kpi("Orders With Activity", orders.length), kpi("Total Entries", orders.reduce((s, x) => s + x.totalEntries, 0))],
    tables: [
      {
        columns: [
          { header: "IO / No" },
          { header: "Buyer" },
          { header: "Style" },
          { header: "Total Entries", align: "right" },
          { header: "Stages Touched", align: "right" },
          { header: "Users", align: "right" },
          { header: "Last Entry" },
        ],
        rows: orders.map((o) => [o.ioNo, o.buyerName ?? "-", o.style, o.totalEntries, o.stageCount, o.userCount, shortDateTime(o.lastEntryAt)]),
      },
    ],
  };
}

function activitySpec(records: SequencedRecord[], meta: ExportMeta): ReportSpec {
  return {
    title: "Detailed Activity Report",
    subtitle: meta.range ? rangeLabel(meta.range) : "",
    filterSummary: meta.filterSummary,
    kpis: [kpi("Entries", records.length), kpi("Users", new Set(records.map((r) => r.userId)).size), kpi("Orders", new Set(records.map((r) => r.orderId)).size)],
    tables: [
      {
        columns: [
          { header: "Date & Time" },
          { header: "User" },
          { header: "IO / No" },
          { header: "Style" },
          { header: "Stage" },
          { header: "Action" },
          { header: "Qty", align: "right" },
          { header: "Unit" },
          { header: "Seq #", align: "right" },
        ],
        rows: [...records]
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((r) => [shortDateTime(r.at), r.userName, r.ioNo, r.style, r.stageLabel, r.action, r.qty ?? "-", r.unit ?? "-", r.sequence]),
      },
    ],
  };
}

function comparisonSpec(c: TodayVsYesterday, meta: ExportMeta): ReportSpec {
  const row3 = (label: string, today: number, yesterday: number): CellInput[] => [label, { text: String(today), align: "right" as const }, { text: String(yesterday), align: "right" as const }, diffCell(today - yesterday)];
  const cols = [{ header: "Name" }, { header: "Today", align: "right" as const }, { header: "Yesterday", align: "right" as const }, { header: "Diff", align: "right" as const }];
  return {
    title: "Today vs Yesterday Comparison",
    subtitle: `${shortDate(new Date().toISOString())} vs ${shortDate(new Date(Date.now() - 86_400_000).toISOString())}`,
    filterSummary: meta.filterSummary,
    kpis: [
      kpi("Entries Today", c.totals.today),
      kpi("Entries Yesterday", c.totals.yesterday),
      { label: "Difference", value: `${c.totals.diff > 0 ? "+" : ""}${c.totals.diff}` },
      kpi("Orders Today", c.orders.today),
      kpi("Orders Yesterday", c.orders.yesterday),
    ],
    tables: [
      { heading: "Overall", columns: cols, rows: [row3("Total Entries", c.totals.today, c.totals.yesterday), row3("Orders Processed", c.orders.today, c.orders.yesterday)] },
      { heading: "By User", columns: cols, rows: c.byUser.map((u) => row3(u.label, u.today, u.yesterday)) },
      { heading: "By Stage", columns: cols, rows: c.byStage.map((s) => row3(s.label, s.today, s.yesterday)) },
      { heading: "By Order", columns: cols, rows: c.byOrder.map((o) => row3(o.label, o.today, o.yesterday)) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Final Order Report - its own card-grid PNG (a different shape, not a flat
// table), sharing the same measuring/fitting helpers.
// ---------------------------------------------------------------------------

const CARD_W_MIN = 560;

function orderCardColumns(order: TrackingOrder) {
  const ctx = measurer();
  // 11.5px/600, matching drawOrderCard's own stage-name draw exactly - a
  // mismatched measuring size is what caused Reports' "Raw Material
  // Planning" truncation (see measureColumns' own comment); this one
  // happened to measure larger than it drew, which only wasted space
  // rather than truncating, but it's tightened to the same exact font here too.
  ctx.font = "600 11.5px " + FONT;
  const stageColW = Math.min(Math.max(...order.stages.map((s) => ctx.measureText(`${s.seq}. ${s.label}`).width)) + 40, 260);
  return { stageColW, statusColW: 92, entriesColW: 70, totalColW: 64, lastColW: 110 };
}

function orderCardHeight(order: TrackingOrder): number {
  return 58 + 26 + order.stages.length * 24 + 6;
}

function drawOrderCard(ctx: CanvasRenderingContext2D, order: TrackingOrder, x: number, y: number, width: number) {
  const h = orderCardHeight(order);
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#E2E8F0";
  ctx.beginPath();
  const rr = 10;
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + width, y, x + width, y + h, rr);
  ctx.arcTo(x + width, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + width, y, rr);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#EFF4FF";
  ctx.fillRect(x + 1, y + 1, width - 2, 56);

  const total = entriesInRange(order);
  ctx.textAlign = "left";
  ctx.fillStyle = "#0F172A";
  ctx.font = "700 15px " + FONT;
  const badge = `${total} ${total === 1 ? "entry" : "entries"}`;
  ctx.font = "700 11px " + FONT;
  const badgeW = ctx.measureText(badge).width + 18;
  ctx.font = "700 15px " + FONT;
  ctx.fillText(fitText(ctx, `IO ${order.ioNo}  ·  ${order.style}`, width - badgeW - 36), x + 14, y + 24);
  ctx.font = "500 11.5px " + FONT;
  ctx.fillStyle = "#475569";
  ctx.fillText(fitText(ctx, `Buyer: ${order.buyer?.name ?? "-"}   |   Delivery: ${shortDate(order.deliveryDate ? `${order.deliveryDate}T00:00:00Z` : null)}${order.color ? `   |   ${order.color}` : ""}`, width - 28), x + 14, y + 44);

  ctx.fillStyle = total > 0 ? BRAND : "#94A3B8";
  ctx.beginPath();
  const bx = x + width - badgeW - 12;
  const by = y + 12;
  ctx.moveTo(bx + 11, by);
  ctx.arcTo(bx + badgeW, by, bx + badgeW, by + 22, 11);
  ctx.arcTo(bx + badgeW, by + 22, bx, by + 22, 11);
  ctx.arcTo(bx, by + 22, bx, by, 11);
  ctx.arcTo(bx, by, bx + badgeW, by, 11);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 11px " + FONT;
  ctx.textAlign = "center";
  ctx.fillText(badge, bx + badgeW / 2, y + 27);
  ctx.textAlign = "left";

  const { stageColW, statusColW, entriesColW, totalColW, lastColW } = orderCardColumns(order);
  const headY = y + 56;
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(x + 1, headY, width - 2, 26);
  ctx.fillStyle = "#64748B";
  ctx.font = "700 10px " + FONT;
  let cx = x + 14;
  ctx.fillText("STAGE", cx, headY + 17);
  cx += stageColW;
  ctx.fillText("STATUS", cx, headY + 17);
  cx += statusColW;
  ctx.textAlign = "right";
  ctx.fillText("ENTRIES", cx + entriesColW - 14, headY + 17);
  cx += entriesColW;
  ctx.fillText("TOTAL", cx + totalColW - 14, headY + 17);
  cx += totalColW;
  ctx.textAlign = "left";
  ctx.fillText("LAST ENTRY", cx, headY + 17);

  order.stages.forEach((s, i) => {
    const ry = headY + 26 + i * 24;
    if (i % 2 === 1) {
      ctx.fillStyle = "#FAFBFC";
      ctx.fillRect(x + 1, ry, width - 2, 24);
    }
    const mid = ry + 16;
    cx = x + 14;
    ctx.fillStyle = "#1E293B";
    ctx.font = "600 11.5px " + FONT;
    ctx.fillText(fitText(ctx, `${s.seq}. ${s.label}`, stageColW - 10), cx, mid);
    cx += stageColW;

    const label = TRACKING_STATUS_LABEL[s.status];
    ctx.font = "700 9.5px " + FONT;
    const pw = Math.min(ctx.measureText(label).width + 14, statusColW - 6);
    ctx.fillStyle = s.status === "completed" ? "#D1FAE5" : s.status === "in_progress" ? "#FEF3C7" : "#F1F5F9";
    ctx.fillRect(cx, ry + 4, pw, 16);
    ctx.fillStyle = STATUS_COLOR[s.status];
    ctx.fillText(fitText(ctx, label, pw - 8), cx + 7, ry + 15);
    cx += statusColW;

    ctx.font = "700 11.5px " + FONT;
    ctx.fillStyle = s.entries > 0 ? BRAND : "#94A3B8";
    ctx.textAlign = "right";
    ctx.fillText(String(s.entries), cx + entriesColW - 14, mid);
    cx += entriesColW;
    ctx.font = "500 11.5px " + FONT;
    ctx.fillStyle = "#475569";
    ctx.fillText(String(s.totalEntries), cx + totalColW - 14, mid);
    cx += totalColW;
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748B";
    ctx.font = "500 11px " + FONT;
    ctx.fillText(fitText(ctx, shortDate(s.lastEntryAt), lastColW - 6), cx, mid);
  });
}

async function renderFinalOrderPng(orders: TrackingOrder[], meta: ExportMeta): Promise<Blob> {
  const cardWidths = orders.map((o) => {
    const { stageColW, statusColW, entriesColW, totalColW, lastColW } = orderCardColumns(o);
    return Math.max(CARD_W_MIN, stageColW + statusColW + entriesColW + totalColW + lastColW + 28);
  });
  const widest = Math.max(CARD_W_MIN, ...cardWidths);
  const cols = orders.length >= 14 ? 3 : orders.length >= 2 ? 2 : 1;
  const pageWidth = PAGE_MARGIN * 2 + cols * widest + (cols - 1) * GAP;

  const headerH = 110;
  const colY = Array.from({ length: cols }, () => headerH);
  const placed = orders.map((o) => {
    const col = colY.indexOf(Math.min(...colY));
    const pos = { o, x: PAGE_MARGIN + col * (widest + GAP), y: colY[col] };
    colY[col] += orderCardHeight(o) + 10;
    return pos;
  });
  const pageHeight = Math.max(...colY, headerH + 60) + PAGE_MARGIN;

  if (pageHeight > MAX_CANVAS_PX || pageWidth > MAX_CANVAS_PX) {
    throw new Error("Too many orders for a single PNG - narrow the filters, or export Excel instead.");
  }
  const scale = pageHeight * 2 > MAX_CANVAS_PX ? 1 : 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(pageWidth * scale);
  canvas.height = Math.ceil(pageHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't create the image.");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#F1F5F9";
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0F172A";
  ctx.font = "800 24px " + FONT;
  ctx.fillText("Final Order Report", PAGE_MARGIN, 42);
  ctx.font = "600 13px " + FONT;
  ctx.fillStyle = BRAND;
  ctx.fillText(meta.range ? rangeLabel(meta.range) : "", PAGE_MARGIN, 64);
  ctx.font = "500 11px " + FONT;
  ctx.fillStyle = "#64748B";
  ctx.fillText(fitText(ctx, meta.filterSummary, pageWidth - PAGE_MARGIN * 2), PAGE_MARGIN, 82);

  const updated = orders.filter((o) => entriesInRange(o) > 0).length;
  const totalEntries = orders.reduce((s, o) => s + entriesInRange(o), 0);
  ctx.textAlign = "right";
  ctx.font = "700 12px " + FONT;
  ctx.fillStyle = "#1E293B";
  ctx.fillText(`${orders.length} orders   |   ${updated} updated   |   ${totalEntries} entries`, pageWidth - PAGE_MARGIN, 64);
  ctx.font = "500 10.5px " + FONT;
  ctx.fillStyle = "#94A3B8";
  ctx.fillText(`Generated ${new Date().toLocaleString("en-GB")}`, pageWidth - PAGE_MARGIN, 82);
  ctx.textAlign = "left";

  if (orders.length === 0) {
    ctx.font = "500 14px " + FONT;
    ctx.fillStyle = "#64748B";
    ctx.fillText("No orders match these filters.", PAGE_MARGIN, headerH + 20);
  }
  for (const p of placed) drawOrderCard(ctx, p.o, p.x, p.y, widest);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  return blob;
}

function finalOrderExcelSheets(orders: TrackingOrder[], meta: ExportMeta): { name: string; spec: ReportSpec }[] {
  const summary: ReportSpec = {
    title: "Final Order Report - Summary",
    subtitle: meta.range ? rangeLabel(meta.range) : "",
    filterSummary: meta.filterSummary,
    kpis: [kpi("Orders", orders.length), kpi("Updated In Range", orders.filter((o) => entriesInRange(o) > 0).length), kpi("Total Entries", orders.reduce((s, o) => s + entriesInRange(o), 0))],
    tables: [
      {
        columns: [
          { header: "IO / No" },
          { header: "Buyer" },
          { header: "Style" },
          { header: "Delivery Date" },
          { header: "Entries In Range", align: "right" },
          { header: "Stages Updated", align: "right" },
          { header: "Total Stages", align: "right" },
          { header: "Completed", align: "right" },
          { header: "In Progress", align: "right" },
          { header: "Not Yet Started", align: "right" },
        ],
        rows: orders.map((o) => [
          o.ioNo,
          o.buyer?.name ?? "-",
          o.style,
          shortDate(o.deliveryDate ? `${o.deliveryDate}T00:00:00Z` : null),
          entriesInRange(o),
          stagesUpdatedInRange(o),
          o.stages.length,
          o.stages.filter((s) => s.status === "completed").length,
          o.stages.filter((s) => s.status === "in_progress").length,
          o.stages.filter((s) => s.status === "not_started").length,
        ]),
      },
    ],
  };
  const detail: ReportSpec = {
    title: "Final Order Report - Stage Detail",
    subtitle: summary.subtitle,
    filterSummary: meta.filterSummary,
    kpis: [],
    tables: [
      {
        columns: [
          { header: "IO / No" },
          { header: "Buyer" },
          { header: "Style" },
          { header: "Stage" },
          { header: "Unit" },
          { header: "Status" },
          { header: "Entries In Range", align: "right" },
          { header: "Total Entries", align: "right" },
          { header: "Last Entry" },
        ],
        rows: orders.flatMap((o) =>
          o.stages.map((s) => [
            o.ioNo,
            o.buyer?.name ?? "-",
            o.style,
            `${s.seq}. ${s.label}`,
            s.unitType,
            { text: TRACKING_STATUS_LABEL[s.status], color: STATUS_COLOR[s.status], bold: true },
            s.entries,
            s.totalEntries,
            shortDateTime(s.lastEntryAt),
          ]),
        ),
      },
    ],
  };
  return [
    { name: "Order Summary", spec: summary },
    { name: "Stage Detail", spec: detail },
  ];
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export type ExportRequest =
  | { type: "finalOrder"; orders: TrackingOrder[]; meta: ExportMeta }
  | { type: "userWise"; users: UserActivitySummary[]; meta: ExportMeta }
  | { type: "stageWise"; stages: StageActivitySummary[]; meta: ExportMeta }
  | { type: "orderWise"; orders: OrderActivitySummary[]; meta: ExportMeta }
  | { type: "activity"; records: SequencedRecord[]; meta: ExportMeta }
  | { type: "comparison"; comparison: TodayVsYesterday; meta: ExportMeta };

const FILE_NAME: Record<ExportRequest["type"], string> = {
  finalOrder: "final-order-report",
  userWise: "user-wise-report",
  stageWise: "stage-wise-report",
  orderWise: "order-wise-report",
  activity: "detailed-activity-report",
  comparison: "today-vs-yesterday",
};

function specFor(req: ExportRequest): ReportSpec {
  switch (req.type) {
    case "userWise":
      return userWiseSpec(req.users, req.meta);
    case "stageWise":
      return stageWiseSpec(req.stages, req.meta);
    case "orderWise":
      return orderWiseSpec(req.orders, req.meta);
    case "activity":
      return activitySpec(req.records, req.meta);
    case "comparison":
      return comparisonSpec(req.comparison, req.meta);
    case "finalOrder":
      throw new Error("Final Order Report has its own PNG layout - use renderFinalOrderPng directly.");
  }
}

export async function exportTrackingReport(req: ExportRequest, format: "png" | "excel"): Promise<void> {
  const name = `${FILE_NAME[req.type]}-${stamp(req.meta.range)}`;

  if (format === "png") {
    const blob = req.type === "finalOrder" ? await renderFinalOrderPng(req.orders, req.meta) : await renderTablesPng(specFor(req));
    download(blob, `${name}.png`);
    return;
  }

  const sheets = req.type === "finalOrder" ? finalOrderExcelSheets(req.orders, req.meta) : [{ name: "Report", spec: specFor(req) }];
  const wb = await buildWorkbook(sheets);
  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
}

export type { ActivityRecord };
