"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOrderTna } from "@/hooks/useTna";
import { useUsers } from "@/hooks/useUsers";
import type { TnaRecord } from "@/lib/tna";
import { Modal } from "@/components/ui/Modal";
import { Loader } from "@/components/ui/Loader";
import { TnaStageCard } from "./TnaStageCard";

/** A stage's full TNA record and history, opened from the timeline or the table. */
export function TnaDetailModal({ record, now, onClose, canEdit = true }: { record: TnaRecord | null; now: number; onClose: () => void; canEdit?: boolean }) {
  const { data, isLoading } = useOrderTna(record?.orderId);
  const { data: users } = useUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u) => [u.id, u.name]));
    return (id: string) => map.get(id) ?? "Unknown";
  }, [users]);
  // Prefer the freshly fetched copy of the record (its actuals are the latest); fall back to the one clicked.
  const live = record ? (data?.records.find((r) => r.id === record.id) ?? record) : null;

  return (
    <Modal open={!!record} onClose={onClose} title={record ? `${record.stageLabel} - IO ${record.order?.ioNo ?? ""} ${record.order?.style ?? ""}` : ""} widthClass="max-w-3xl">
      {live && (
        <div className="space-y-4">
          {isLoading && !data ? <Loader label="Loading the history…" /> : <TnaStageCard record={{ ...live, order: record?.order }} events={data?.events ?? []} now={now} nameOf={nameOf} />}
          {canEdit && (
            <div className="flex justify-end">
              <Link href={`/admin/TNA/assign?order=${live.orderId}`} className="rounded-xl bg-brand-gradient px-4 py-2 text-xs font-bold text-white shadow-[0_8px_18px_-8px_rgba(21,94,239,0.55)]">
                Edit this order&apos;s TNA →
              </Link>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
