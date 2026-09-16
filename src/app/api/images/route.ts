import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireApiSession, apiError } from "@/lib/server/http";
import { canCreateOrders } from "@/lib/server/authz";

const MAX_BYTES = 8 * 1024 * 1024;

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
  if (!file.type.startsWith("image/")) return apiError(400, "Only image files are allowed.");
  if (file.size > MAX_BYTES) return apiError(400, "Image is too large (max 8MB).");

  const bytes = Buffer.from(await file.arrayBuffer());

  const image = await prisma.orderImage.create({
    data: {
      fileName: file.name || "image",
      contentType: file.type,
      sizeBytes: bytes.length,
      data: bytes,
    },
    select: { id: true },
  });

  return NextResponse.json({ imageId: image.id }, { status: 201 });
}
