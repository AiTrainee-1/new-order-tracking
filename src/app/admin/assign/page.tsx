"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useUsers } from "@/hooks/useUsers";
import { useOrdersList } from "@/hooks/useOrdersList";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { useAssignments, useCreateAssignment, useDeleteAssignment } from "@/hooks/useAssignments";
import { useStageAssignments } from "@/hooks/useStageAssignments";
import { PHASES, phaseOf } from "@/lib/stagePhases";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Toggle } from "@/components/ui/FormControls";
import { Loader } from "@/components/ui/Loader";
import { AccentCard, PageHero, SectionTitle } from "@/components/ui/SectionCard";

export default function AssignWorkPage() {
  const toast = useToast();
  const { data: users } = useUsers();
  const { data: orders } = useOrdersList();
  const { data: allAssignments } = useAssignments();
  const { data: stageAssignments } = useStageAssignments();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const [userId, setUserId] = useState("");
  const [ioNo, setIoNo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [sectionIds, setSectionIds] = useState<Set<string>>(new Set());
  const [unitName, setUnitName] = useState("");
  const [canEnterData, setCanEnterData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orderDetail = useOrderDetail(orderId || undefined);

  const ioNumbers = useMemo(() => Array.from(new Set((orders ?? []).map((o) => o.ioNo))).sort(), [orders]);
  const ordersForIo = useMemo(() => (orders ?? []).filter((o) => o.ioNo === ioNo), [orders, ioNo]);
  const quickOrders = useMemo(
    () => [...(orders ?? [])].sort((a, b) => (parseInt(a.ioNo, 10) || 0) - (parseInt(b.ioNo, 10) || 0) || a.style.localeCompare(b.style)),
    [orders],
  );

  const selectedUser = users?.find((u) => u.id === userId);

  const existingForUserOrder = useMemo(
    () => (allAssignments ?? []).filter((a) => a.userId === userId && a.orderId === orderId),
    [allAssignments, userId, orderId],
  );
  const existingSectionIds = new Set(existingForUserOrder.map((a) => a.sectionId));

  const userDefaultSectionIds = useMemo(() => {
    if (!orderDetail) return new Set<string>();
    const defaultStageDefIds = new Set((stageAssignments ?? []).filter((a) => a.userId === userId).map((a) => a.stageDefinitionId));
    return new Set(orderDetail.stagePlan.filter((s) => defaultStageDefIds.has(s.stageDefinitionId)).map((s) => s.id));
  }, [orderDetail, stageAssignments, userId]);

  function toggleSection(id: string) {
    setSectionIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!userId || !orderId || sectionIds.size === 0) {
      setError("Select a user, an order, and at least one new section.");
      return;
    }
    const jobs = Array.from(sectionIds)
      .filter((sectionId) => !userDefaultSectionIds.has(sectionId) && !existingSectionIds.has(sectionId))
      .map((sectionId) =>
        createAssignment.mutateAsync({
          userId,
          orderId,
          poId: null,
          sectionId,
          unitName: unitName || null,
          canEnterData,
        }),
      );
    if (jobs.length === 0) {
      setError("Every selected section is already assigned to this user.");
      return;
    }
    try {
      await Promise.all(jobs);
      setSuccess(`Created ${jobs.length} assignment(s) successfully.`);
      toast.success(`Created ${jobs.length} assignment(s) successfully.`);
      setSectionIds(new Set());
      setUnitName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save assignment.";
      setError(message);
      toast.error(message);
    }
  }

  const assignmentsByUser = useMemo(() => {
    const map = new Map<string, typeof allAssignments extends undefined ? never : NonNullable<typeof allAssignments>>();
    for (const a of allAssignments ?? []) {
      const list = (map.get(a.userId) ?? []) as NonNullable<typeof allAssignments>;
      list.push(a);
      map.set(a.userId, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length || a[1][0].user.name.localeCompare(b[1][0].user.name));
  }, [allAssignments]);

  return (
    <div className="space-y-6">
      <PageHero
        icon="🧩"
        iconBg="linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)"
        title="Assign Work"
        titleGradient="linear-gradient(100deg, #155EEF 0%, #7C3AED 60%, #DB2777 100%)"
        description="Grant a user access to specific stages on a specific order."
      />

      <AccentCard tone="sky" className="p-5">
        <p className="mb-3"><SectionTitle icon="👤" tone="sky">Step 1 - Who is being assigned</SectionTitle></p>
        <Select value={userId} onChange={(e) => { setUserId(e.target.value); setSectionIds(new Set()); }}>
          <option value="">Select a user…</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
          ))}
        </Select>
      </AccentCard>

      <AccentCard tone="violet" className="p-5">
        <p className="mb-3"><SectionTitle icon="📦" tone="violet">Step 2 - Which order</SectionTitle></p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            label="Quick select (number-wise)"
            value={orderId}
            onChange={(e) => {
              const order = quickOrders.find((o) => o.id === e.target.value);
              if (order) { setIoNo(order.ioNo); setOrderId(order.id); setSectionIds(new Set()); }
            }}
          >
            <option value="">Select…</option>
            {quickOrders.map((o) => (
              <option key={o.id} value={o.id}>{o.ioNo} - {o.style}</option>
            ))}
          </Select>
          <Select
            label="IO / No"
            value={ioNo}
            onChange={(e) => { setIoNo(e.target.value); setOrderId(""); setSectionIds(new Set()); }}
          >
            <option value="">Select…</option>
            {ioNumbers.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
          <Select
            label="Style / Color"
            value={orderId}
            disabled={!ioNo}
            onChange={(e) => { setOrderId(e.target.value); setSectionIds(new Set()); }}
          >
            <option value="">Select…</option>
            {ordersForIo.map((o) => (
              <option key={o.id} value={o.id}>{o.style}{o.color ? ` / ${o.color}` : ""}</option>
            ))}
          </Select>
        </div>
      </AccentCard>

      {orderDetail && (
        <AccentCard tone="amber" className="p-5">
          <p className="mb-3"><SectionTitle icon="🗂️" tone="amber">Step 3 - Which sections (this order&apos;s own stage plan)</SectionTitle></p>
          <div className="space-y-3">
            {PHASES.map((phase) => {
              const phaseStages = orderDetail.stagePlan.filter((s) => phaseOf(s.key) === phase.key);
              if (phaseStages.length === 0) return null;
              return (
                <div key={phase.key} className={`rounded-lg border-l-4 ${phase.rail} ${phase.band} p-3 transition-shadow hover:shadow-[0_6px_16px_-10px_rgba(15,23,42,0.25)]`}>
                  <p className={`mb-2 text-xs font-bold ${phase.text}`}>{phase.label}</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {phaseStages.map((stage) => {
                      const locked = existingSectionIds.has(stage.id) || userDefaultSectionIds.has(stage.id);
                      const lockedLabel = existingSectionIds.has(stage.id) ? "Assigned" : "Default";
                      return (
                        <div key={stage.id} className={`rounded-md px-2 py-1 ${locked ? "opacity-60" : "hover:bg-white/60"}`}>
                          <Checkbox
                            checked={locked || sectionIds.has(stage.id)}
                            onChange={() => !locked && toggleSection(stage.id)}
                            label={
                              <span className="flex flex-1 items-center gap-2">
                                <span className="flex-1 text-ink-800">{stage.label}</span>
                                {locked && <Badge tone={lockedLabel === "Default" ? "brand" : "info"}>{lockedLabel}</Badge>}
                              </span>
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </AccentCard>
      )}

      <AccentCard tone="emerald" className="p-5">
        <p className="mb-3"><SectionTitle icon="🔐" tone="emerald">Step 4 - Access & unit</SectionTitle></p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Unit / Vendor Name (optional)" value={unitName} onChange={(e) => setUnitName(e.target.value)} />
          <Toggle checked={canEnterData} onChange={setCanEnterData} label="Can Enter Data" description="Turn off for monitor-only access to this scope." />
        </div>

        <div className="-mx-5 -mb-5 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-white/70 bg-gradient-to-r from-emerald-50/70 to-white/70 px-5 py-4 text-xs text-ink-600">
          <div className="flex flex-wrap gap-3">
            <span><b>User:</b> {selectedUser?.name ?? "-"}</span>
            <span><b>Order:</b> {orderId ? `${ioNo}` : "-"}</span>
            <span><b>New sections:</b> {sectionIds.size}</span>
            <span><b>Access:</b> {canEnterData ? "Can Enter Data" : "Monitor Only"}</span>
          </div>
          <Button onClick={handleSubmit} isLoading={createAssignment.isPending}>Save Assignment</Button>
        </div>
        {error && <p className="mt-3 text-sm text-status-bad">{error}</p>}
        {success && <p className="mt-3 text-sm text-status-good">{success}</p>}
      </AccentCard>

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink-900"><SectionTitle icon="📜" tone="rose">Existing Assignments</SectionTitle></h2>
        {!allAssignments && <Loader label="Loading assignments…" />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {assignmentsByUser.map(([uid, rows], i) => (
            <Card
              key={uid}
              className="animate-fadeInUp p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-12px_rgba(15,23,42,0.25)]"
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationFillMode: "backwards" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-[0_6px_14px_-6px_rgba(21,94,239,0.5)]">
                  {rows[0].user.name.slice(0, 1).toUpperCase()}
                </span>
                <p className="text-sm font-bold text-ink-900">{rows[0].user.name}</p>
                <Badge tone="brand">{rows.length}</Badge>
              </div>
              <div className="mt-3 space-y-1.5">
                {rows.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50/60 px-2 py-1.5 text-xs text-ink-600 transition-colors hover:bg-ink-50">
                    <span>
                      <Badge tone={a.canEnterData ? "neutral" : "info"}>{a.canEnterData ? "Can Enter" : "Monitor"}</Badge>{" "}
                      {a.section?.label} - {a.order?.ioNo} ({a.order?.style}
                      {a.order?.color ? `, ${a.order.color}` : ""}){a.unitName ? ` - ${a.unitName}` : ""}
                    </span>
                    <button
                      className="font-semibold text-status-bad hover:underline"
                      onClick={() => deleteAssignment.mutate(a.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
