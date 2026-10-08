import { NextResponse } from "next/server";
import { requireApiSession, apiError } from "@/lib/server/http";
import { isAdminOrMd } from "@/lib/server/authz";
import { listTnaRecords } from "@/lib/server/tna";

/** Every TNA schedule across all orders, with live actuals - the data behind the
 *  TNA View page. Admin and MD only (it spans orders nobody else may see). */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!(await isAdminOrMd(auth.session.userId))) return apiError(403, "Only Admin and MD accounts can view TNA across orders.");

  const records = await listTnaRecords({ withOrder: true });
  return NextResponse.json({ records });
}
