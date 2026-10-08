import { NextResponse } from "next/server";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdminOrMd } from "@/lib/server/authz";
import { tnaAlertCounts } from "@/lib/server/tna";

/** How many open stages are overdue / in grace / due soon right now - the number
 *  on the sidebar's TNA badge. */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdminOrMd(auth.session.userId))) return apiError(403, "Only Admin and MD accounts can view TNA alerts.");

  return NextResponse.json(await tnaAlertCounts());
}
