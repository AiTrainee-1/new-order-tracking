"use client";

import { Suspense } from "react";
import { Loader } from "@/components/ui/Loader";
import { TnaAssign } from "@/components/tna/TnaAssign";

/** TNA Assignment - schedule an order's stages (start, end, optional grace). */
export default function TnaAssignPage() {
  return (
    <Suspense fallback={<Loader full label="Loading…" />}>
      <TnaAssign />
    </Suspense>
  );
}
