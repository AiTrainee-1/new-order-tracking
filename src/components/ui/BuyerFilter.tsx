"use client";

import { useBuyers } from "@/hooks/useBuyers";
import { Select } from "@/components/ui/FormControls";

/** The Buyer Name filter every order listing shows beside its search box.
 *  "" means all buyers. Pair with `matchesBuyer` from lib/buyers.ts. */
export function BuyerFilter({ value, onChange, className = "" }: { value: string; onChange: (buyerId: string) => void; className?: string }) {
  const { data: buyers = [] } = useBuyers();
  return (
    <Select label="Buyer Name" value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">All buyers</option>
      {buyers.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </Select>
  );
}
