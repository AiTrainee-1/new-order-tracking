"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useOrdersList, type OrderListRow } from "@/hooks/useOrdersList";
import { useDeleteOrder, useSetOrderHidden } from "@/hooks/useOrderMutations";
import { usePersistedState } from "@/hooks/usePersistedFilters";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { Loader } from "@/components/ui/Loader";
import { PageHero } from "@/components/ui/SectionCard";
import { Tabs } from "@/components/ui/Tabs";
import { OrderCreatePanel } from "@/components/forms/OrderCreatePanel";
import { MyOrdersPanel } from "@/components/orders/MyOrdersPanel";

type CreateTab = "new" | "mine";

/**
 * The floor-side counterpart to Admin's "+ Create Order" - same form, same
 * useCreateOrder mutation, same result: a normal row in `orders` that shows
 * up everywhere else in the app exactly like an Admin-created one (Dashboard,
 * Orders, Assign Work, Stage Roles, Data Input). The only thing scoped to
 * this user is what they're allowed to do here - create, and manage what
 * they created - not what the created order can be used for afterward.
 *
 * Laid out like the Admin pages: a hero, then two tabs - the form, and
 * "Your orders" (the Admin Orders overview, filters and cards, limited to
 * what this person created). Creating an order drops you on the second tab
 * with the new order in it.
 *
 * Reachable only with canCreateOrders (granted from Stage Roles); the nav
 * item is hidden without it, and this is the backstop if someone still types
 * the URL directly. The real backstop is server-side - the orders API's
 * authz check blocks it regardless - this is just the friendly version.
 */
export default function CreateOrderPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const setHidden = useSetOrderHidden();
  const deleteOrder = useDeleteOrder();
  // includeHidden: this is the one list in the whole app that's SUPPOSED to
  // still show a hidden order - otherwise there'd be nowhere left to unhide
  // it from (see useOrdersList's default, which excludes them everywhere else).
  const { data, isLoading } = useOrdersList({ includeHidden: true });
  // Remembered for the tab, so coming back from an order's Edit page lands on "Your orders".
  const [tab, setTab] = usePersistedState<CreateTab>(`ot:create-order:${appUser?.id ?? "anon"}:tab`, "new", (v) => v === "new" || v === "mine");

  const myOrders = useMemo(() => (data ?? []).filter((o) => o.createdBy === appUser?.id), [data, appUser]);

  useEffect(() => {
    if (appUser && !appUser.canCreateOrders) router.replace("/user/home");
  }, [appUser, router]);

  async function toggleHidden(order: OrderListRow) {
    try {
      await setHidden.mutateAsync({ orderId: order.id, hidden: !order.isHidden });
      toast.success(order.isHidden ? "Order unhidden." : "Order hidden - it won't show anywhere else in the app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the order.");
    }
  }

  async function handleDelete(order: OrderListRow) {
    const ok = await confirm({
      title: "Delete this order?",
      message: `This permanently deletes "${order.style}" and everything under it - POs, size breakdowns, assignments, and any recorded production. It can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      toast.success(`Deleted "${order.style}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete order.");
    }
  }

  if (!appUser || !appUser.canCreateOrders) return <Loader full label="Loading…" />;

  return (
    <div className="space-y-6">
      <PageHero
        icon="📦"
        iconBg="linear-gradient(135deg, #34D399 0%, #0D9488 100%)"
        title="Create Order"
        titleGradient="linear-gradient(100deg, #155EEF 0%, #7C3AED 60%, #DB2777 100%)"
        description="Add a new garment order and its POs - it'll appear across the whole app just like any other order, ready to be assigned and tracked."
        action={
          !isLoading && myOrders.length > 0 ? (
            <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {myOrders.length} order{myOrders.length === 1 ? "" : "s"} created by you
            </span>
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "new", label: "+ New order" },
          { key: "mine", label: isLoading ? "Your orders" : `Your orders (${myOrders.length})` },
        ]}
      />

      {tab === "new" ? (
        <OrderCreatePanel
          onCreated={() => {
            setTab("mine");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : (
        <MyOrdersPanel
          orders={myOrders}
          isLoading={isLoading}
          onToggleHidden={toggleHidden}
          onDelete={handleDelete}
          hidePending={setHidden.isPending}
          deletePending={deleteOrder.isPending}
          onCreateFirst={() => setTab("new")}
        />
      )}
    </div>
  );
}
