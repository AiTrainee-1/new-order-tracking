import { ReportsView } from "@/components/reports/ReportsView";

/** Admin-only (the /admin tree is gated to admins in proxy.ts). */
export default function AdminReportsPage() {
  return <ReportsView />;
}
