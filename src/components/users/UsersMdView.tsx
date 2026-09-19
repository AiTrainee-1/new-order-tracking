"use client";

import { useMemo, useRef, useState } from "react";
import type { PublicAppUser } from "@/lib/types";
import { userMatchesSearch } from "@/lib/users";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import type { HealthSegment } from "@/components/ui/HealthBar";
import { HealthOverviewCard, SummaryCard } from "@/components/ui/OverviewCards";

export interface AssignedWork {
  label: string;
  /** From a global Stage Roles default (applies to every order whose plan
   * includes the stage) rather than a one-off assignment scoped to a
   * specific order/PO. */
  isDefault: boolean;
}

/** Where an account stands for the MD's "who is doing what" view. Every
 *  account is in exactly one: switched off, enabled with work, or enabled
 *  with nothing yet. */
type Standing = "assigned" | "unassigned" | "inactive";

const STANDINGS: { key: Standing; label: string; color: string }[] = [
  { key: "assigned", label: "Assigned", color: "#059669" },
  { key: "unassigned", label: "Unassigned", color: "#F59E0B" },
  { key: "inactive", label: "Inactive", color: "#94A3B8" },
];

function standingOf(user: PublicAppUser, work: AssignedWork[]): Standing {
  if (!user.isActive) return "inactive";
  return work.length > 0 ? "assigned" : "unassigned";
}

type StandingFilter = "all" | Standing;

/**
 * The MD's Users view - a read-only directory, not a data table: one card
 * per person, showing exactly what they're on right now. Given its data so
 * the layout can be rendered without the fetches; the route works out who
 * is assigned what (see MdUsersPage for how per-order assignments and stage
 * defaults are folded together).
 */
export function UsersMdView({
  users,
  workByUser,
  stageCoverage,
}: {
  users: PublicAppUser[];
  workByUser: Map<string, AssignedWork[]>;
  /** How many catalog stages have at least one person covering them. */
  stageCoverage: { covered: number; total: number };
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StandingFilter>("all");
  const resultsRef = useRef<HTMLDivElement>(null);

  const workOf = (u: PublicAppUser) => workByUser.get(u.id) ?? [];

  // The overview always describes every account, not whatever the search and
  // filter below happen to be showing.
  const standingCounts = useMemo(() => {
    const next: Record<Standing, number> = { assigned: 0, unassigned: 0, inactive: 0 };
    for (const u of users) next[standingOf(u, workByUser.get(u.id) ?? [])]++;
    return next;
  }, [users, workByUser]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      userMatchesSearch(
        u,
        (workByUser.get(u.id) ?? []).map((w) => w.label),
        q,
      ),
    );
  }, [users, search, workByUser]);

  const counts = useMemo(() => {
    const next: Record<StandingFilter, number> = { all: searched.length, assigned: 0, unassigned: 0, inactive: 0 };
    for (const u of searched) next[standingOf(u, workByUser.get(u.id) ?? [])]++;
    return next;
  }, [searched, workByUser]);

  const visible = useMemo(() => (filter === "all" ? searched : searched.filter((u) => standingOf(u, workByUser.get(u.id) ?? []) === filter)), [searched, filter, workByUser]);

  function selectStanding(standing: Standing) {
    const next = filter === standing ? "all" : standing;
    setFilter(next);
    if (next !== "all") requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (users.length === 0) {
    return <p className="rounded-2xl border border-ink-100 bg-white/70 px-4 py-10 text-center text-sm text-ink-500">No user accounts yet.</p>;
  }

  const segments: HealthSegment[] = STANDINGS.map((s) => ({ ...s, count: standingCounts[s.key], alert: false }));
  const activeCount = standingCounts.assigned + standingCounts.unassigned;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <HealthOverviewCard
          tone="emerald"
          icon="👥"
          title="Who's working on what"
          subtitle="Click a status to see just those people."
          headlineLabel="Accounts"
          headline={users.length}
          badge={standingCounts.unassigned > 0 ? { tone: "warn", text: `${standingCounts.unassigned} unassigned` } : { tone: "good", text: "Everyone has work" }}
          segments={segments}
          total={users.length}
          ariaLabel={`Accounts: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}`}
          activeKey={filter === "all" ? null : filter}
          onSelect={(key) => selectStanding(key as Standing)}
          unitLabel="accounts"
        />

        <SummaryCard
          tone="sky"
          icon="🎯"
          title="Stage coverage"
          subtitle="Stages with someone on them."
          headline={`${stageCoverage.covered}/${stageCoverage.total}`}
          headlineLabel="stages covered"
          tiles={[
            { label: "Active", value: activeCount },
            { label: "Unassigned", value: standingCounts.unassigned, valueClass: standingCounts.unassigned > 0 ? "text-amber-600" : "text-ink-900" },
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
                { key: "assigned", label: "Assigned", count: counts.assigned },
                { key: "unassigned", label: "Unassigned", count: counts.unassigned },
                { key: "inactive", label: "Inactive", count: counts.inactive },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span>
                {visible.length} of {users.length} accounts
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
            {visible.map((u) => (
              <UserWorkCard key={u.id} user={u} work={workOf(u)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserWorkCard({ user, work }: { user: PublicAppUser; work: AssignedWork[] }) {
  const tone: CardStatusTone = work.length > 0 ? "completed" : "notStarted";
  const accent = cardStatusAccent[tone];

  return (
    <div style={cardStatusSoftBg[tone]} className={`relative flex animate-fadeInUp flex-col gap-4 overflow-hidden rounded-2xl border p-5 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-md" style={{ backgroundColor: accent }}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-ink-900">{user.name}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-600">@{user.username}</p>
        </div>
        <Badge tone={user.isActive ? "good" : "bad"}>{user.isActive ? "Active" : "Inactive"}</Badge>
      </div>

      <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Role</p>
        <p className="truncate text-sm font-semibold text-ink-900">{user.role}</p>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Assigned work</p>
        {work.length === 0 ? (
          <p className="text-xs text-ink-400">No section assigned yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {work.map((w) => (
              <Badge key={w.label} tone={w.isDefault ? "info" : "neutral"}>
                {w.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
