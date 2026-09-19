/**
 * Order-tracking pages (OrderCard, DashboardOrderCard, OrderDetailPage,
 * OutputPage) are reused verbatim between /admin and /md - same component,
 * same data, same everything, per the MD role's design (it's a read-only
 * view onto the exact same order tracking system, not a separate copy). The
 * only thing that differs is which base path their internal links point
 * back into - without this, clicking an order from the MD dashboard would
 * try to enter a route gated to admin-only and immediately bounce back out.
 */
export function orderTrackingBasePath(pathname: string): "/admin" | "/md" {
  return pathname.startsWith("/md") ? "/md" : "/admin";
}
