"use client";

import { useBuyers } from "@/hooks/useBuyers";
import { FilterIcon, FilterSelect } from "@/components/ui/FilterSelect";

/** The Buyer Name filter every order listing shows beside its search box.
 *  "" means all buyers. Pair with `matchesBuyer` from lib/buyers.ts. */
export function BuyerFilter({ value, onChange, className = "" }: { value: string; onChange: (buyerId: string) => void; className?: string }) {
  const { data: buyers = [] } = useBuyers();
  return (
    <FilterSelect
      label="Buyer Name"
      icon={FilterIcon.buyer}
      value={value}
      onChange={onChange}
      className={className}
      searchPlaceholder="Search buyers…"
      options={[{ value: "", label: "All buyers" }, ...buyers.map((b) => ({ value: b.id, label: b.name }))]}
    />
  );
}
