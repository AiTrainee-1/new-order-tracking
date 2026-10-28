import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canCreateOrders } from "@/lib/server/authz";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The raster formats an order photo may be, by what the bytes really are (sharp reads the file header) - never
 * by the type the browser claims. SVG in particular is refused: it can carry script, and images are served
 * from the app's own origin.
 */
const ALLOWED_FORMATS: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** Order images are stored as Postgres bytea (a deliberate choice over S3 -
 *  see the schema.prisma OrderImage comment), so creating one is just a
 *  Route Handler that reads the multipart body and inserts a row. Uploaded
 *  independently of the order itself: the picker in OrderForm needs a
 *  preview and an id before the order exists at all. */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await canCreateOrders(auth.session.userId))) {
    return apiError(403, "You don't have permission to create orders.");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return apiError(400, "No file uploaded.");
  if (file.size > MAX_BYTES) return apiError(400, "Image is too large (max 8MB).");

  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const format = await sharp(bytes)
    .metadata()
    .then((m) => m.format)
    .catch(() => undefined);
  const detectedType = format ? ALLOWED_FORMATS[format] : undefined;
  if (!detectedType) return apiError(400, "Only JPEG, PNG, WebP or GIF images are allowed.");
  let contentType = detectedType;

  // A phone photo or a design export can be several megabytes - and every list that shows the order pulls it from the
  // database. Nothing in the app shows a garment photo larger than a card or a detail header, so an upload above
  // 400 KB is stored as a 1600px-wide WebP instead (usually 100-300 KB). Smaller uploads, and anything that
  // cannot be re-encoded, are kept exactly as sent.
  if (bytes.length > 400 * 1024 && /^image\/(png|jpe?g|webp)$/.test(contentType)) {
    try {
      const resized = await sharp(bytes).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      if (resized.length < bytes.length) {
        bytes = resized;
        contentType = "image/webp";
      }
    } catch (error) {
      console.warn("Could not shrink the uploaded image, storing it as sent:", error);
    }
  }

  const image = await prisma.orderImage.create({
    data: {
      fileName: file.name || "image",
      contentType,
      sizeBytes: bytes.length,
      data: new Uint8Array(bytes),
    },
    select: { id: true },
  });

  return NextResponse.json({ imageId: image.id }, { status: 201 });
}
