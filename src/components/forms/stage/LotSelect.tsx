"use client";

import { useState } from "react";
import { useEntryUser } from "@/hooks/useEntryUser";
import { useToast } from "@/context/ToastContext";
import { useCreateLot } from "@/hooks/useProductionChain";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import type { ProductionLot } from "@/lib/types";

// ---------------------------------------------------------------------------
// Lot picker
// ---------------------------------------------------------------------------

export function LotSelect({
  lots,
  value,
  onChange,
  orderId,
  poId,
  allowCreate = false,
  label = "Lot",
}: {
  lots: ProductionLot[];
  value: string;
  onChange: (lotId: string) => void;
  orderId: string;
  poId: string | null;
  allowCreate?: boolean;
  label?: string;
}) {
  const appUser = useEntryUser();
  const createLot = useCreateLot();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [lotNo, setLotNo] = useState("");

  async function handleCreate() {
    const trimmed = lotNo.trim();
    if (!trimmed || !appUser) return;
    if (lots.some((l) => l.lotNo.toLowerCase() === trimmed.toLowerCase())) {
      toast.show(`Lot ${trimmed} already exists on this order.`, "error");
      return;
    }
    try {
      const lot = await createLot.mutateAsync({ orderId, poId, lotNo: trimmed });
      onChange(lot.id);
      setLotNo("");
      setAdding(false);
      toast.show(`Lot ${trimmed} created.`, "success");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Could not create the lot.", "error");
    }
  }

  if (adding) {
    return (
      <div className="flex items-end gap-2">
        <Input
          label="New lot number"
          value={lotNo}
          onChange={(e) => setLotNo(e.target.value)}
          placeholder="e.g. LOT-001"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
        />
        <Button type="button" size="sm" onClick={handleCreate} isLoading={createLot.isPending} className="mb-0.5">
          Create
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)} className="mb-0.5">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[9rem]">
          <option value="">- Select lot -</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotNo}
            </option>
          ))}
        </Select>
        {allowCreate && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} className="mb-0.5">
            + New Lot
          </Button>
        )}
      </div>
      {!allowCreate && lots.length === 0 && (
        <p className="text-[11px] text-amber-700">
          No lots on this order yet. Lots are created at whichever stage this order designated as the
          lot-origin stage - once it does, they appear here.
        </p>
      )}
    </div>
  );
}
