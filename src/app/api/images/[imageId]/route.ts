import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiError } from "@/lib/server/http";

/** The widths a caller may ask for (rounded up to the next one), so a handful of cached copies serves everyone. */
const WIDTHS = [64, 128, 192, 256, 384, 512, 768, 1024];
/** An upload this small is not worth re-encoding. */
const RESIZE_ABOVE_BYTES = 24 * 1024;
const RESIZABLE = /^image\/(png|jpe?g|webp|gif)$/;

function wantedWidth(raw: string | null): number | null {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return null;
  return WIDTHS.find((w) => w >= n) ?? WIDTHS[WIDTHS.length - 1];
}

/** Streams one order image's bytes. Deliberately public, no session check -
 *  same as the old app's public Supabase Storage bucket, and required by the
 *  public QR-share page which shows the garment photo with no auth either.
 *
 *  `?w=128` returns a copy resized to that width (WebP): the cards that show a 56px
 *  thumbnail used to download the whole original upload - some are 7 MB - for every
 *  order on the page. The result is cached for a year (an image id never changes
 *  its bytes), so each size is built once. */
export async function GET(request: NextRequest, context: RouteContext<"/api/images/[imageId]">) {
  const { imageId } = await context.params;
  const width = wantedWidth(request.nextUrl.searchParams.get("w"));

  const image = await prisma.orderImage.findUnique({
    where: { id: imageId },
    select: { data: true, contentType: true, fileName: true, sizeBytes: true },
  });
  if (!image) return apiError(404, "Image not found.");

  let body: BodyInit = new Uint8Array(image.data);
  let contentType = image.contentType;

  if (width && image.sizeBytes > RESIZE_ABOVE_BYTES && RESIZABLE.test(image.contentType)) {
    try {
      // sharp ships with Next.js (it is what next/image uses); if it is ever missing, the original is sent instead.
      const sharp = (await import("sharp")).default;
      const resized = await sharp(image.data).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      if (resized.length < image.sizeBytes) {
        body = new Uint8Array(resized);
        contentType = "image/webp";
      }
    } catch (error) {
      console.warn("Image resize failed, sending the original:", error);
    }
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${image.fileName}"`,
    },
  });
}
