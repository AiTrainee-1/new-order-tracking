import { TrackingHistoryView } from "@/components/trackingHistory/TrackingHistoryView";

/** Admin-only (the /admin tree is gated to admins in proxy.ts, and the API
 *  behind it checks the role again). */
export default function AdminTrackingHistoryPage() {
  return <TrackingHistoryView />;
}
