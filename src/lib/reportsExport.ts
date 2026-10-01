import type { DateRange } from "./trackingHistory";
import { rangeLabel, toDateKey } from "./trackingHistory";
import type { ReportRow } from "./reports";
import { BRAND, BRAND_RGB, FONT, INK_RGB, MAX_CANVAS_PX, PAGE_MARGIN, download, drawTable, fitText, measureColumns, measurer, tableHeight, type TableSpec } from "./trackingHistoryExport";

/**
 * The Reports page's own export - a single branded table (Order / Buyer /
 * Stage / Entries / View Details), sized to its real content exactly like
 * every Tracking History export (see trackingHistoryExport.ts, whose
 * measuring/drawing primitives this reuses directly rather than
 * reimplementing). What's different here is the company header: the real
 * logo file, baked into both the PNG and the Excel sheet, plus a genuine
 * clickable hyperlink in the "View Details" column.
 */

const LOGO_SRC = "/UKT_Company_Logo.png";
const LOGO_ASPECT = 1536 / 1024;

export interface ReportExportMeta {
  range: DateRange;
  filterSummary: string;
}

/** A filename stamp in the browser's own LOCAL date - slicing the ISO (UTC)
 *  string directly would show the wrong day for every timezone ahead of UTC
 *  (see the identical fix in trackingHistoryExport.ts's own `stamp`). */
function stamp(range: DateRange): string {
  const a = toDateKey(new Date(range.fromISO));
  const b = toDateKey(new Date(range.toISO));
  return a === b ? a : `${a}_to_${b}`;
}

function publicOrderUrl(orderId: string): string {
  return `${window.location.origin}/share/output/${orderId}`;
}

function reportTable(rows: ReportRow[]): TableSpec {
  return {
    columns: [
      { header: "Order" },
      { header: "Buyer" },
      { header: "Stage" },
      { header: "Entries", align: "right" },
      { header: "View Details" },
    ],
    rows: rows.map((r) => [
      `${r.ioNo} · ${r.style}`,
      r.buyerName ?? "-",
      r.stageLabel,
      r.entries,
      { text: "View Details", hyperlink: publicOrderUrl(r.orderId) },
    ]),
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the logo."));
    reader.readAsDataURL(blob);
  });
}

/** The source file is a 1536x1024 PNG (~2MB) - plenty sharp for the canvas
 *  draw below (drawImage scales it down cheaply, no re-encoding), but
 *  embedding that same 2MB original into every exported Excel file for a
 *  logo shown at 108x72 would make a 12-row report heavier than it has any
 *  reason to be. `excelBase64` is a PNG re-encoded at the size it's
 *  actually displayed at (2x for a sharp retina render), typically tens of
 *  KB instead of ~2MB. */
async function loadLogo(): Promise<{ bitmap: ImageBitmap; excelBase64: string }> {
  const res = await fetch(LOGO_SRC);
  if (!res.ok) throw new Error("Could not load the company logo.");
  const bitmap = await createImageBitmap(await res.blob());

  const canvas = document.createElement("canvas");
  canvas.width = 216;
  canvas.height = 144;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't create a canvas.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const thumbBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!thumbBlob) throw new Error("Could not prepare the logo for Excel.");

  return { bitmap, excelBase64: await blobToBase64(thumbBlob) };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const LOGO_H = 46;
const HEADER_H = 108;

export async function exportReportPng(rows: ReportRow[], meta: ReportExportMeta): Promise<void> {
  const { bitmap: logo } = await loadLogo();
  const table = reportTable(rows);
  const colWidths = measureColumns(table.columns, table.rows);
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  const ctx0 = measurer();
  ctx0.font = "700 13px " + FONT;
  const headerTextW = PAGE_MARGIN + LOGO_H * LOGO_ASPECT + 16 + Math.max(ctx0.measureText("UK TEXTILES").width, ctx0.measureText(meta.filterSummary).width) + PAGE_MARGIN;

  const pageWidth = Math.max(760, tableW + PAGE_MARGIN * 2, headerTextW);
  const pageHeight = PAGE_MARGIN * 2 + HEADER_H + (rows.length > 0 ? tableHeight(table) : 40);

  if (pageHeight > MAX_CANVAS_PX || pageWidth > MAX_CANVAS_PX) {
    throw new Error("This report is too large for one PNG - narrow the filters, or export Excel instead.");
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

  // Header card
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, pageWidth, HEADER_H);
  ctx.strokeStyle = "#E2E8F0";
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  ctx.lineTo(pageWidth, HEADER_H);
  ctx.stroke();

  const logoW = LOGO_H * LOGO_ASPECT;
  ctx.drawImage(logo, PAGE_MARGIN, 18, logoW, LOGO_H);

  const textX = PAGE_MARGIN + logoW + 18;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0F172A";
  ctx.font = "800 17px " + FONT;
  ctx.fillText("UK TEXTILES", textX, 32);
  ctx.font = "600 11.5px " + FONT;
  ctx.fillStyle = BRAND;
  ctx.fillText("Report Generated from Order Tracking", textX, 50);
  ctx.font = "500 11px " + FONT;
  ctx.fillStyle = "#64748B";
  ctx.fillText(fitText(ctx, meta.filterSummary, pageWidth - textX - PAGE_MARGIN), textX, 68);

  ctx.textAlign = "right";
  ctx.font = "800 15px " + FONT;
  ctx.fillStyle = "#0F172A";
  ctx.fillText("Order & Stage Report", pageWidth - PAGE_MARGIN, 32);
  ctx.font = "700 12px " + FONT;
  ctx.fillStyle = BRAND;
  ctx.fillText(rangeLabel(meta.range), pageWidth - PAGE_MARGIN, 50);
  ctx.font = "500 10.5px " + FONT;
  ctx.fillStyle = "#94A3B8";
  ctx.fillText(`Generated ${new Date().toLocaleString("en-GB")}`, pageWidth - PAGE_MARGIN, 68);
  ctx.textAlign = "left";

  if (rows.length === 0) {
    ctx.font = "500 14px " + FONT;
    ctx.fillStyle = "#64748B";
    ctx.fillText("No entries match these filters.", PAGE_MARGIN, HEADER_H + 26);
  } else {
    drawTable(ctx, PAGE_MARGIN, HEADER_H + PAGE_MARGIN - 8, tableW, colWidths, table);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  download(blob, `order-stage-report-${stamp(meta.range)}.png`);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

export async function exportReportExcel(rows: ReportRow[], meta: ReportExportMeta): Promise<void> {
  const [ExcelJS, { excelBase64: logoBase64 }] = await Promise.all([import("exceljs"), loadLogo()]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "UK Textiles - Order Tracker";
  wb.created = new Date();

  const ws = wb.addWorksheet("Report", { views: [] });
  const maxCols = 5;

  const imageId = wb.addImage({ base64: `data:image/png;base64,${logoBase64}`, extension: "png" });
  ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 108, height: 72 } });
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 10;

  ws.mergeCells(1, 2, 1, maxCols);
  ws.getCell(1, 2).value = "UK TEXTILES";
  ws.getCell(1, 2).font = { bold: true, size: 16, color: { argb: INK_RGB } };

  ws.mergeCells(2, 2, 2, maxCols);
  ws.getCell(2, 2).value = "Report Generated from Order Tracking";
  ws.getCell(2, 2).font = { bold: true, italic: true, size: 11, color: { argb: BRAND_RGB } };

  ws.mergeCells(3, 2, 3, maxCols);
  ws.getCell(3, 2).value = `Order & Stage Report  |  ${rangeLabel(meta.range)}  |  ${meta.filterSummary}  |  Generated ${new Date().toLocaleString("en-GB")}`;
  ws.getCell(3, 2).font = { size: 9.5, color: { argb: "FF64748B" } };

  let r = 6;
  if (rows.length === 0) {
    ws.getCell(r, 1).value = "No entries match these filters.";
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF64748B" } };
  } else {
    const headerRowIdx = r;
    const headers = ["Order", "Buyer", "Stage", "Entries", "View Details"];
    const headerRow = ws.getRow(headerRowIdx);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RGB } };
      cell.alignment = { vertical: "middle", horizontal: i === 3 ? "right" : "left" };
    });
    headerRow.height = 20;
    r += 1;

    for (const row of rows) {
      const excelRow = ws.getRow(r);
      excelRow.getCell(1).value = `${row.ioNo} · ${row.style}`;
      excelRow.getCell(2).value = row.buyerName ?? "-";
      excelRow.getCell(3).value = row.stageLabel;
      excelRow.getCell(4).value = row.entries;
      excelRow.getCell(4).alignment = { horizontal: "right" };
      const link = excelRow.getCell(5);
      link.value = { text: "View Details", hyperlink: publicOrderUrl(row.orderId) };
      link.font = { color: { argb: BRAND_RGB }, underline: true };
      r += 1;
    }

    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: r - 1, column: maxCols } };
    ws.views = [{ state: "frozen", ySplit: headerRowIdx, xSplit: 0 }];
  }

  const widthOf = (header: string, key: keyof ReportRow | "order" | "view", hint: number) => {
    const values =
      key === "order"
        ? rows.map((row) => `${row.ioNo} · ${row.style}`)
        : key === "view"
          ? rows.map(() => "View Details")
          : rows.map((row) => String(row[key] ?? ""));
    return Math.min(Math.max(header.length, ...values.map((v) => v.length), hint) + 3, 48);
  };
  ws.columns = [
    { width: widthOf("Order", "order", 16) },
    { width: widthOf("Buyer", "buyerName", 14) },
    { width: widthOf("Stage", "stageLabel", 14) },
    { width: widthOf("Entries", "entries", 9) },
    { width: widthOf("View Details", "view", 14) },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `order-stage-report-${stamp(meta.range)}.xlsx`);
}
