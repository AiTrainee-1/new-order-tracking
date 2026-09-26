"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useMyWork, type GateStatus, type WorkItem } from "@/hooks/useMyWork";
import { Card, CardBody } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { Select } from "@/components/ui/FormControls";
import { SearchInput } from "@/components/ui/SearchInput";
import { BuyerFilter } from "@/components/ui/BuyerFilter";
import { matchesBuyer } from "@/lib/buyers";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Button } from "@/components/ui/Button";
import { OrderWorkflowChain } from "@/components/dashboard/OrderWorkflowChain";
import type { OrderProgress } from "@/lib/progress";
import type { Order } from "@/lib/types";

const PAGE_SIZE = 5;
const ALL_ORDERS = "all";

type StatusFilter = "all" | "active" | "locked" | "completed" | "monitor";

/** Ordering priority for the work grid: actionable first, done last. */
const GATE_PRIORITY: Record<GateStatus, number> = { active: 0, locked: 1, completed: 2 };

interface OrderGroup {
  order: Order;
  orderProgress: OrderProgress;
  items: WorkItem[];
}

function matchesQuery(item: WorkItem, query: string): boolean {
  if (!query) return true;
  const order = item.assignment.order;
  const haystack = [order?.style, order?.ioNo, order?.buyer?.name, order?.color, order?.description, item.assignment.section?.label, item.assignment.po?.poNumber]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesStatus(item: WorkItem, status: StatusFilter): boolean {
  if (status === "all") return true;
  if (status === "monitor") return !item.assignment.canEnterData;
  return item.gateStatus === status;
}

export default function HomePage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const { workItems, isLoading, isError } = useMyWork(appUser?.id);

  const [query, setQuery] = useState("");
  const [orderId, setOrderId] = useState(ALL_ORDERS);
  const [buyerId, setBuyerId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const searched = useMemo(() => workItems.filter((item) => matchesQuery(item, query) && (!item.assignment.order || matchesBuyer(item.assignment.order, buyerId))), [workItems, query, buyerId]);

  // Every order the user has any assignment in, regardless of the current
  // search or status tab - a stable pick list rather than one that shrinks
  // out from under the dropdown as other filters change.
  const orderOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; ioNo: string }>();
    for (const item of workItems) {
      const order = item.assignment.order;
      if (!order || byId.has(order.id)) continue;
      byId.set(order.id, { id: order.id, label: `${order.style} · IO ${order.ioNo}${order.color ? ` · ${order.color}` : ""}`, ioNo: order.ioNo });
    }
    return Array.from(byId.values()).sort((a, b) => a.ioNo.localeCompare(b.ioNo, undefined, { numeric: true }));
  }, [workItems]);

  const scoped = useMemo(() => (orderId === ALL_ORDERS ? searched : searched.filter((item) => item.assignment.order?.id === orderId)), [searched, orderId]);

  // Scoped to the chosen order, so picking one narrows the tab counts to it
  // too - "Your Turn" then means "your turn on THIS order", not the other 27.
  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = { all: scoped.length, active: 0, locked: 0, completed: 0, monitor: 0 };
    for (const item of scoped) {
      next[item.gateStatus]++;
      if (!item.assignment.canEnterData) next.monitor++;
    }
    return next;
  }, [scoped]);

  // The whole point of the workflow-chain view is to always show a
  // complete, connected order - so grouping happens ahead of the status
  // filter (which order to show), never a per-node filter (what shows up
  // inside it). An order still appears whole even if only one of the
  // user's several stages in it matches the active tab.
  const orderGroups = useMemo(() => {
    const byOrderId = new Map<string, OrderGroup>();
    for (const item of scoped) {
      const order = item.assignment.order;
      if (!order) continue;
      let group = byOrderId.get(order.id);
      if (!group) {
        group = { order, orderProgress: item.orderProgress, items: [] };
        byOrderId.set(order.id, group);
      }
      group.items.push(item);
    }
    return Array.from(byOrderId.values())
      .filter((group) => group.items.some((item) => matchesStatus(item, status)))
      .sort((a, b) => {
        const aPriority = Math.min(...a.items.map((i) => GATE_PRIORITY[i.gateStatus]));
        const bPriority = Math.min(...b.items.map((i) => GATE_PRIORITY[i.gateStatus]));
        return aPriority - bPriority || a.order.ioNo.localeCompare(b.order.ioNo, undefined, { numeric: true });
      });
  }, [scoped, status]);

  const totalPages = Math.max(1, Math.ceil(orderGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = orderGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateBuyer(value: string) {
    setBuyerId(value);
    setPage(1);
  }

  function updateOrder(value: string) {
    setOrderId(value);
    setPage(1);
  }

  function updateStatus(value: StatusFilter) {
    setStatus(value);
    setPage(1);
  }

  if (isLoading) return <Loader full label="Loading your assigned work…" />;
  if (isError) return <p className="text-sm text-status-bad">Couldn&apos;t load your assignments.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-900">Welcome, {appUser?.name}</h1>
        <p className="text-sm text-ink-500">Here&apos;s what&apos;s assigned to you right now.</p>
      </div>

      {workItems.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">No work has been assigned to you yet. Check back once your Admin assigns an order.</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_16rem]">
              <SearchInput label="Find an order" placeholder="Type a style, IO number, color, PO, or section…" value={query} onChange={(e) => updateQuery(e.target.value)} />
              <BuyerFilter value={buyerId} onChange={updateBuyer} />
              <Select label="Choose Order" value={orderId} onChange={(e) => updateOrder(e.target.value)}>
                <option value={ALL_ORDERS}>All orders ({orderOptions.length})</option>
                {orderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </CardBody>
          </Card>

          <FilterTabs
            value={status}
            onChange={updateStatus}
            tabs={[
              { key: "all", label: "All", count: counts.all },
              { key: "active", label: "Your Turn", count: counts.active },
              { key: "locked", label: "Waiting", count: counts.locked },
              { key: "completed", label: "Completed", count: counts.completed },
              { key: "monitor", label: "Monitor Only", count: counts.monitor },
            ]}
          />

          <p className="text-xs text-ink-500">
            {orderGroups.length} matching order{orderGroups.length === 1 ? "" : "s"}
          </p>

          {orderGroups.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-500">No assignments match your search/filter.</p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-4">
              {pageGroups.map((group) => (
                <OrderWorkflowChain
                  key={group.order.id}
                  order={group.order}
                  orderProgress={group.orderProgress}
                  myItems={group.items}
                  onOpenAssignment={(assignmentId) => router.push(`/user/data-input?assignment=${assignmentId}`)}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                ← Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
