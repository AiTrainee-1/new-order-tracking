"use client";

import { useMemo, useRef, useState } from "react";
import type { PublicAppUser } from "@/lib/types";
import { userActivity, userMatchesSearch, type UserActivity } from "@/lib/users";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Loader } from "@/components/ui/Loader";
import { SearchInput } from "@/components/ui/SearchInput";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";
import { UserAdminCard } from "@/components/users/UserAdminCard";

type UserFilter = "all" | UserActivity;

/** Healthy to unhealthy, left to right. */
const ACTIVITY: { key: UserActivity; label: string; color: string }[] = [
  { key: "today", label: "Active today", color: "#059669" },
  { key: "active", label: "Not seen today", color: "#155EEF" },
  { key: "inactive", label: "Inactive", color: "#94A3B8" },
];

/**
 * The admin Users page, given its data and actions - split from the route so
 * the layout can be rendered without the fetches or the modals. The route
 * owns every mutation and dialog (create, edit, reset password, delete);
 * this is just the overview, the search and filters, and the cards.
 */
export function UsersAdminView({
  users,
  isLoading,
  currentUserId,
  sectionsByUser,
  onAdd,
  onToggleActive,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  users: PublicAppUser[] | undefined;
  isLoading: boolean;
  currentUserId: string | undefined;
  /** Section labels each user is assigned to, by user id. */
  sectionsByUser: Map<string, string[]>;
  onAdd: () => void;
  onToggleActive: (user: PublicAppUser) => void;
  onEdit: (user: PublicAppUser) => void;
  onResetPassword: (user: PublicAppUser) => void;
  onDelete: (user: PublicAppUser) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const resultsRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => users ?? [], [users]);

  // The overview always describes every account, not whatever the search and
  // filter below happen to be showing.
  const activityCounts = useMemo(() => {
    const next: Record<UserActivity, number> = { today: 0, active: 0, inactive: 0 };
    for (const u of list) next[userActivity(u)]++;
    return next;
  }, [list]);

  // Search narrows the pool first; the tabs (and their counts) then operate
  // on whatever it left behind.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => userMatchesSearch(u, sectionsByUser.get(u.id) ?? [], q));
  }, [list, search, sectionsByUser]);

  const counts = useMemo(() => {
    const next: Record<UserFilter, number> = { all: searched.length, today: 0, active: 0, inactive: 0 };
    for (const u of searched) next[userActivity(u)]++;
    return next;
  }, [searched]);

  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((u) => userActivity(u) === filter)), [searched, filter]);

  function selectActivity(activity: UserActivity) {
    const next = filter === activity ? "all" : activity;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const segments: HealthSegment[] = ACTIVITY.map((a) => ({ ...a, count: activityCounts[a.key] }));
  const canEnter = list.filter((u) => !u.isMonitorOnly).length;
  const monitorOnly = list.filter((u) => u.isMonitorOnly).length;
  const orderCreators = list.filter((u) => u.canCreateOrders).length;
  const jobWork = list.filter((u) => u.canJobWork).length;
  const admins = list.filter((u) => u.role === "admin" || u.role === "md").length;

  return (
    <div className="space-y-6">
      {isLoading && <Loader label="Loading users…" />}

      {!isLoading && list.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-2xl shadow-[0_12px_30px_-8px_rgba(21,94,239,0.45)]">👥</span>
          <p className="text-sm font-semibold text-ink-800">No user accounts yet</p>
          <Button onClick={onAdd}>+ Add User</Button>
        </Card>
      )}

      {list.length > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <HealthOverviewCard
              tone="emerald"
              icon="👥"
              title="People at a glance"
              subtitle="Click a status to see just those people."
              headlineLabel="Accounts"
              headline={list.length}
              badge={activityCounts.inactive > 0 ? { tone: "warn", text: `${activityCounts.inactive} inactive` } : { tone: "good", text: "All accounts active" }}
              segments={segments}
              total={list.length}
              ariaLabel={`Accounts: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}`}
              activeKey={filter === "all" ? null : filter}
              onSelect={(key) => selectActivity(key as UserActivity)}
              unitLabel="accounts"
            />

            <SummaryCard
              tone="violet"
              icon="🔑"
              title="Access"
              subtitle="What each account is allowed to do."
              headline={canEnter}
              headlineLabel="can enter data"
              tiles={[
                { label: "Monitor only", value: monitorOnly },
                { label: "Admin / MD", value: admins },
                { label: "Order creators", value: orderCreators },
                { label: "Job work", value: jobWork },
              ]}
            />
          </div>

          <div ref={resultsRef} className="scroll-mt-6 space-y-6">
            <Card>
              <CardBody className="space-y-4">
                <SearchInput label="Find a person" placeholder="Type a name, username, role, phone, or section…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <FilterTabs
                  value={filter}
                  onChange={setFilter}
                  tabs={[
                    { key: "all", label: "All", count: counts.all },
                    { key: "today", label: "Active Today", count: counts.today },
                    { key: "active", label: "Not Seen Today", count: counts.active },
                    { key: "inactive", label: "Inactive", count: counts.inactive },
                  ]}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <span>
                      {visible.length} of {list.length} accounts
                    </span>
                    {(filter !== "all" || search.trim() !== "") && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilter("all");
                          setSearch("");
                        }}
                        className="font-semibold text-brand hover:underline"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                  <Button onClick={onAdd}>+ Add User</Button>
                </div>
              </CardBody>
            </Card>

            {visible.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="py-6 text-center text-sm text-ink-500">No accounts match these filters.</p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">
                {visible.map((user) => (
                  <UserAdminCard
                    key={user.id}
                    user={user}
                    sections={sectionsByUser.get(user.id) ?? []}
                    isSelf={user.id === currentUserId}
                    onToggleActive={onToggleActive}
                    onEdit={onEdit}
                    onResetPassword={onResetPassword}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
