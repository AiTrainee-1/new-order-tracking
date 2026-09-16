"use client";

import { useQuery } from "@tanstack/react-query";
import type { StagePlanCatalogEntry } from "@/lib/stagePlan";
import type { StagePlanTemplateWithItems } from "@/components/forms/StagePlanPicker";

export function useStageDefinitions() {
  return useQuery({
    queryKey: ["stage_definitions"],
    queryFn: async (): Promise<StagePlanCatalogEntry[]> => {
      const res = await fetch("/api/stage-definitions");
      if (!res.ok) throw new Error("Could not load stage definitions.");
      const data = await res.json();
      return data.stages;
    },
    staleTime: Infinity,
  });
}

export function useStagePlanTemplates() {
  return useQuery({
    queryKey: ["stage_plan_templates"],
    queryFn: async (): Promise<StagePlanTemplateWithItems[]> => {
      const res = await fetch("/api/stage-plan-templates");
      if (!res.ok) throw new Error("Could not load stage plan templates.");
      const data = await res.json();
      return data.templates;
    },
    staleTime: Infinity,
  });
}
