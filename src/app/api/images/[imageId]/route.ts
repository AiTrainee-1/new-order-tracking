import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { apiError } from "@/lib/server/http";

/** Streams one order image's bytes. Deliberately public, no session check -
 *  same as the old app's public Supabase Storage bucket, and required by the
 *  public QR-share page which shows the garment photo with no auth either. */
export async function GET(_request: Request, context: RouteContext<"/api/images/[imageId]">) {
  const { imageId } = await context.params;

  const image = await prisma.orderImage.findUnique({
    where: { id: imageId },
    select: { data: true, contentType: true, fileName: true },
  });
  if (!image) return apiError(404, "Image not found.");

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${image.fileName}"`,
    },
  });
}
