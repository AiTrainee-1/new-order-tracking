import {
  TRACKING_STATUS_LABEL,
  entriesInRange,
  rangeLabel,
  shortDate,
  stagesUpdatedInRange,
  type TrackingOrder,
  type TrackingStageStatus,
} from "./trackingHistory";

/**
 * Tracking History exports. Both are built from the exact orders the page is
 * showing (after its Buyer / IO / status filters), so a report always matches
 * the screen it was exported from.
 *
 * xlsx is imported on demand (it's most of a megabyte and only this button
 * needs it); the PNG is drawn straight onto a canvas, so it needs no library.
 */

export interface TrackingExportContext {
  from: string;
  to: string;
  orders: TrackingOrder[];
  /** Human text for the active filters, e.g. "Buyer: H&M · IO / No: All". */
  filterSummary: string;
}

function fileStamp(ctx: TrackingExportContext): string {
  return ctx.from === ctx.to ? ctx.from : `${ctx.from}_to_${ctx.to}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

export async function exportTrackingHistoryExcel(ctx: TrackingExportContext): Promise<void> {
  const XLSX = await import("xlsx");
  const period = rangeLabel(ctx.from, ctx.to);

  const detailHead = ["Date", "IO / No", "Buyer Name", "Style Name", "Colour", "Delivery Date", "Stage No.", "Stage", "Unit", "Status", "Entries (in period)", "Total Entries", "Last Entry Date"];
  const detailRows = ctx.orders.flatMap((o) =>
    o.stages.map((s) => [
      period,
      o.ioNo,
      o.buyer?.name ?? "",
      o.style,
      o.color ?? "",
      o.deliveryDate ?? "",
      s.seq,
      s.label,
      s.unitType,
      TRACKING_STATUS_LABEL[s.status],
      s.entries,
      s.totalEntries,
      s.lastEntryDate ?? "",
    ]),
  );

  const countOf = (o: TrackingOrder, status: TrackingStageStatus) => o.stages.filter((s) => s.status === status).length;
  const summaryHead = ["Date", "IO / No", "Buyer Name", "Style Name", "Delivery Date", "Entries (in period)", "Stages Updated", "Total Stages", "Completed", "In Progress", "Not Yet Started", "Updated In Period?"];
  const summaryRows = ctx.orders.map((o) => [
    period,
    o.ioNo,
    o.buyer?.name ?? "",
    o.style,
    o.deliveryDate ?? "",
    entriesInRange(o),
    stagesUpdatedInRange(o),
    o.stages.length,
    countOf(o, "completed"),
    countOf(o, "in_progress"),
    countOf(o, "not_started"),
    entriesInRange(o) > 0 ? "Yes" : "No",
  ]);

  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([summaryHead, ...summaryRows]);
  summary["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 16 }, { wch: 18 }];
  summary["!autofilter"] = { ref: `A1:L${summaryRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, summary, "Order Summary");

  const detail = XLSX.utils.aoa_to_sheet([detailHead, ...detailRows]);
  detail["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 6 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
  detail["!autofilter"] = { ref: `A1:M${detailRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, detail, "Stage Details");

  XLSX.writeFile(wb, `tracking-history-${fileStamp(ctx)}.xlsx`);
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<TrackingStageStatus, { fg: string; bg: string }> = {
  completed: { fg: "#047857", bg: "#D1FAE5" },
  in_progress: { fg: "#B45309", bg: "#FEF3C7" },
  not_started: { fg: "#64748B", bg: "#F1F5F9" },
};

const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const MARGIN = 30;
const GAP = 24;
const BLOCK_W = 720;
/** Beyond this many orders the sheet goes three columns wide instead of two,
 *  so a fleet-wide report stays a manageable height. */
const THREE_COLUMN_FROM = 14;
const HEAD_H = 62;
const COLHEAD_H = 26;
const ROW_H = 25;
const BLOCK_PAD = 14;
/** Browsers refuse canvases past roughly this many pixels on a side. */
const MAX_CANVAS_PX = 30000;

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blockHeight(o: TrackingOrder): number {
  return HEAD_H + COLHEAD_H + o.stages.length * ROW_H + BLOCK_PAD;
}

function drawOrderBlock(c: CanvasRenderingContext2D, o: TrackingOrder, x: number, y: number) {
  const h = blockHeight(o);
  // Card
  c.fillStyle = "#FFFFFF";
  roundRect(c, x, y, BLOCK_W, h - BLOCK_PAD + 4, 10);
  c.fill();
  c.strokeStyle = "#E2E8F0";
  c.lineWidth = 1;
  c.stroke();

  // Header band
  c.fillStyle = "#EFF4FF";
  roundRect(c, x, y, BLOCK_W, HEAD_H, 10);
  c.fill();
  c.fillStyle = "#EFF4FF";
  c.fillRect(x, y + HEAD_H - 10, BLOCK_W, 10);

  const total = entriesInRange(o);
  c.textBaseline = "alphabetic";
  c.fillStyle = "#0F172A";
  c.font = `700 16px ${FONT}`;
  const badge = `${total} ${total === 1 ? "entry" : "entries"}`;
  c.font = `700 12px ${FONT}`;
  const badgeW = c.measureText(badge).width + 20;
  c.font = `700 16px ${FONT}`;
  c.fillText(fit(c, `IO ${o.ioNo}  ·  ${o.style}`, BLOCK_W - badgeW - 40), x + 14, y + 26);

  c.font = `500 12px ${FONT}`;
  c.fillStyle = "#475569";
  const meta = `Buyer: ${o.buyer?.name ?? "-"}   |   Delivery: ${shortDate(o.deliveryDate)}${o.color ? `   |   ${o.color}` : ""}`;
  c.fillText(fit(c, meta, BLOCK_W - 28), x + 14, y + 48);

  c.fillStyle = total > 0 ? "#155EEF" : "#94A3B8";
  roundRect(c, x + BLOCK_W - badgeW - 12, y + 12, badgeW, 22, 11);
  c.fill();
  c.fillStyle = "#FFFFFF";
  c.font = `700 12px ${FONT}`;
  c.textAlign = "center";
  c.fillText(badge, x + BLOCK_W - badgeW / 2 - 12, y + 27);
  c.textAlign = "left";

  // Column header
  const colX = { stage: x + 14, status: x + 250, entries: x + 470, total: x + 550, last: x + 610 };
  const headY = y + HEAD_H;
  c.fillStyle = "#F8FAFC";
  c.fillRect(x + 1, headY, BLOCK_W - 2, COLHEAD_H);
  c.fillStyle = "#64748B";
  c.font = `700 10px ${FONT}`;
  c.fillText("STAGE", colX.stage, headY + 17);
  c.fillText("STATUS", colX.status, headY + 17);
  c.textAlign = "right";
  c.fillText("ENTRIES", colX.entries + 40, headY + 17);
  c.fillText("TOTAL", colX.total + 40, headY + 17);
  c.textAlign = "left";
  c.fillText("LAST ENTRY", colX.last, headY + 17);

  // Stage rows
  o.stages.forEach((s, i) => {
    const ry = headY + COLHEAD_H + i * ROW_H;
    if (i % 2 === 1) {
      c.fillStyle = "#FAFBFC";
      c.fillRect(x + 1, ry, BLOCK_W - 2, ROW_H);
    }
    const mid = ry + 17;
    c.fillStyle = "#1E293B";
    c.font = `600 12px ${FONT}`;
    c.fillText(fit(c, `${s.seq}. ${s.label}`, 226), colX.stage, mid);

    const st = STATUS_STYLE[s.status];
    const label = TRACKING_STATUS_LABEL[s.status];
    c.font = `700 10px ${FONT}`;
    const pw = c.measureText(label).width + 16;
    c.fillStyle = st.bg;
    roundRect(c, colX.status, ry + 4, pw, 17, 8.5);
    c.fill();
    c.fillStyle = st.fg;
    c.fillText(label, colX.status + 8, ry + 16);

    c.font = `700 12px ${FONT}`;
    c.fillStyle = s.entries > 0 ? "#155EEF" : "#94A3B8";
    c.textAlign = "right";
    c.fillText(String(s.entries), colX.entries + 40, mid);
    c.font = `500 12px ${FONT}`;
    c.fillStyle = "#475569";
    c.fillText(String(s.totalEntries), colX.total + 40, mid);
    c.textAlign = "left";
    c.fillText(shortDate(s.lastEntryDate), colX.last, mid);
  });
}

export async function exportTrackingHistoryPng(ctx: TrackingExportContext): Promise<void> {
  const { orders } = ctx;

  // Two columns, each new order going under whichever is shorter so the
  // sheet stays roughly rectangular however many orders there are.
  const cols = orders.length >= THREE_COLUMN_FROM ? 3 : 2;
  const PAGE_W = MARGIN * 2 + cols * BLOCK_W + (cols - 1) * GAP;
  const headerH = 118;
  const colY = Array.from({ length: cols }, () => headerH);
  const placed = orders.map((o) => {
    const col = colY.indexOf(Math.min(...colY));
    const pos = { o, x: MARGIN + col * (BLOCK_W + GAP), y: colY[col] };
    colY[col] += blockHeight(o) + 10;
    return pos;
  });
  const pageH = Math.max(...colY, headerH + 60) + MARGIN;

  if (pageH > MAX_CANVAS_PX) {
    throw new Error("Too many orders for a single PNG - narrow the Buyer / IO / date filters, or use Excel.");
  }
  const scale = pageH * 2 > MAX_CANVAS_PX ? 1 : 2;

  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W * scale;
  canvas.height = pageH * scale;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Your browser couldn't create the image.");
  c.scale(scale, scale);

  c.fillStyle = "#F1F5F9";
  c.fillRect(0, 0, PAGE_W, pageH);

  // Title block
  c.fillStyle = "#0F172A";
  c.font = `800 28px ${FONT}`;
  c.textBaseline = "alphabetic";
  c.fillText("Tracking History", MARGIN, 46);
  c.font = `600 15px ${FONT}`;
  c.fillStyle = "#155EEF";
  c.fillText(rangeLabel(ctx.from, ctx.to), MARGIN, 72);
  c.font = `500 12px ${FONT}`;
  c.fillStyle = "#475569";
  c.fillText(ctx.filterSummary, MARGIN, 94);

  const updated = orders.filter((o) => entriesInRange(o) > 0).length;
  const totalEntries = orders.reduce((sum, o) => sum + entriesInRange(o), 0);
  const summary = `${orders.length} order${orders.length === 1 ? "" : "s"}   |   ${updated} updated   |   ${orders.length - updated} with no updates   |   ${totalEntries} entries`;
  c.font = `700 13px ${FONT}`;
  c.fillStyle = "#1E293B";
  c.textAlign = "right";
  c.fillText(summary, PAGE_W - MARGIN, 72);
  c.font = `500 11px ${FONT}`;
  c.fillStyle = "#94A3B8";
  c.fillText(`Generated ${new Date().toLocaleString("en-GB")}`, PAGE_W - MARGIN, 94);
  c.textAlign = "left";

  if (orders.length === 0) {
    c.font = `500 14px ${FONT}`;
    c.fillStyle = "#64748B";
    c.fillText("No orders match these filters.", MARGIN, headerH + 30);
  }

  for (const p of placed) drawOrderBlock(c, p.o, p.x, p.y);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the PNG.");
  download(blob, `tracking-history-${fileStamp(ctx)}.png`);
}
