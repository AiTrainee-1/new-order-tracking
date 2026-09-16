"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { GarmentPlaceholder } from "@/components/ui/GarmentPlaceholder";
import { orderImageUrl } from "@/lib/imageUrl";
import type { Order } from "@/lib/types";

const CARD_WIDTH = 720;
const CARD_HEIGHT = 1080;
const BRAND_BLUE = "#155EEF";
const INK_900 = "#101828";
const INK_500 = "#667085";
const INK_200 = "#E4EAF2";

interface ShareQrModalProps {
  open: boolean;
  onClose: () => void;
  order: Order;
}

/**
 * "Share QR" button's modal (see the Output & Reports action bar). Encodes
 * the public, unauthenticated /share/output/[orderId] route (SharedOutputPage
 * + api/public-order-output) into a QR code, and can bake it - alongside
 * the order image/style/quantity - into a downloadable "order card" PNG.
 */
export function ShareQrModal({ open, onClose, order }: ShareQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/share/output/${order.id}` : "";
  const imageUrl = orderImageUrl(order.imageId);

  useEffect(() => {
    if (!open || !shareUrl) return;
    setError(null);
    setQrDataUrl(null);
    QRCode.toDataURL(shareUrl, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: INK_900, light: "#FFFFFFFF" },
    })
      .then(setQrDataUrl)
      .catch(() => setError("Couldn't generate the QR code."));
  }, [open, shareUrl]);

  async function handleDownload() {
    if (!qrDataUrl) return;
    setIsDownloading(true);
    setError(null);
    try {
      const blob = await buildOrderCardBlob({ order, imageUrl, qrDataUrl });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.ioNo}-${order.style}-qr-card.png`.replace(/[^\w.-]+/g, "_");
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't build the downloadable card.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share QR Code" widthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-xs text-ink-500">Anyone who scans this opens a read-only production dashboard for this order — no login needed.</p>

        <div className="mx-auto flex w-full max-w-[280px] flex-col items-center gap-3 rounded-2xl border border-ink-200 bg-white p-5 text-center shadow-sm">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={order.style} className="h-full w-full object-cover" />
            ) : (
              <GarmentPlaceholder className="h-9 w-9 text-ink-500" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-ink-900">{order.style}</p>
            <p className="text-xs text-ink-500">
              IO {order.ioNo}
              {order.color ? ` · ${order.color}` : ""}
            </p>
            <p className="mt-1 text-sm font-bold text-brand">{order.totalQty.toLocaleString()} PCS</p>
          </div>
          <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-ink-100 bg-white p-1.5">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code" className="h-full w-full" />
            ) : (
              <span className="text-[11px] text-ink-400">Generating…</span>
            )}
          </div>
          <p className="text-[10px] text-ink-400">Scan to view the live production dashboard</p>
        </div>

        {error && <p className="text-center text-xs font-medium text-status-bad">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={handleDownload} isLoading={isDownloading} disabled={!qrDataUrl}>
            Download Card
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function loadImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** GarmentPlaceholder's SVG path, redrawn on canvas - keeps the download
 * working even with no order image, or one that fails to load/taints. */
function drawGarmentGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  const path = new Path2D("M8.5 3.5 5 6l1.5 2.5L8 7.5V20h8V7.5l1.5 1 1.5-2.5-3.5-2.5c-.5.8-1.5 1.5-3 1.5s-2.5-.7-3-1.5Z");
  ctx.strokeStyle = INK_500;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(path);
  ctx.restore();
}

async function buildOrderCardBlob({ order, imageUrl, qrDataUrl }: { order: Order; imageUrl: string | null; qrDataUrl: string }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  const centerX = CARD_WIDTH / 2;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  bgGradient.addColorStop(0, "#F4F7FC");
  bgGradient.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  roundedRectPath(ctx, 24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48, 32);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = INK_200;
  ctx.lineWidth = 2;
  ctx.stroke();

  let y = 88;

  const imgBoxSize = 260;
  ctx.save();
  roundedRectPath(ctx, centerX - imgBoxSize / 2, y, imgBoxSize, imgBoxSize, 28);
  ctx.fillStyle = "#F4F7FC";
  ctx.fill();
  ctx.clip();
  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl, "anonymous");
      const scale = Math.max(imgBoxSize / img.width, imgBoxSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, centerX - dw / 2, y + imgBoxSize / 2 - dh / 2, dw, dh);
    } catch {
      drawGarmentGlyph(ctx, centerX, y + imgBoxSize / 2, 96);
    }
  } else {
    drawGarmentGlyph(ctx, centerX, y + imgBoxSize / 2, 96);
  }
  ctx.restore();
  y += imgBoxSize + 48;

  ctx.textAlign = "center";
  ctx.fillStyle = INK_900;
  ctx.font = "700 40px Arial, sans-serif";
  ctx.fillText(order.style, centerX, y, CARD_WIDTH - 96);
  y += 40;

  ctx.fillStyle = INK_500;
  ctx.font = "500 24px Arial, sans-serif";
  ctx.fillText(`IO ${order.ioNo}${order.color ? ` · ${order.color}` : ""}`, centerX, y);
  y += 52;

  const qtyText = `${order.totalQty.toLocaleString()} PCS`;
  ctx.font = "700 32px Arial, sans-serif";
  const pillW = ctx.measureText(qtyText).width + 64;
  const pillH = 56;
  roundedRectPath(ctx, centerX - pillW / 2, y, pillW, pillH, pillH / 2);
  ctx.fillStyle = "#EAF1FF";
  ctx.fill();
  ctx.fillStyle = BRAND_BLUE;
  ctx.textBaseline = "middle";
  ctx.fillText(qtyText, centerX, y + pillH / 2 + 2);
  ctx.textBaseline = "alphabetic";
  y += pillH + 48;

  ctx.strokeStyle = INK_200;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX - 220, y);
  ctx.lineTo(centerX + 220, y);
  ctx.stroke();
  y += 48;

  const qrSize = 280;
  roundedRectPath(ctx, centerX - qrSize / 2 - 16, y - 16, qrSize + 32, qrSize + 32, 24);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = INK_200;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, centerX - qrSize / 2, y, qrSize, qrSize);
  y += qrSize + 44;

  ctx.fillStyle = INK_500;
  ctx.font = "500 20px Arial, sans-serif";
  ctx.fillText("Scan to view the live production dashboard", centerX, y);

  ctx.fillStyle = INK_500;
  ctx.font = "700 18px Arial, sans-serif";
  ctx.fillText("UK TEXTILES", centerX, CARD_HEIGHT - 56);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the card image."));
    }, "image/png");
  });
}
