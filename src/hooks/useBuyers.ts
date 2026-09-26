"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Buyer {
  id: string;
  name: string;
}

/** Every saved buyer, A-Z - feeds the order forms' dropdown and every Buyer filter. */
export function useBuyers() {
  return useQuery({
    queryKey: ["buyers"],
    queryFn: async (): Promise<Buyer[]> => {
      const res = await fetch("/api/buyers");
      if (!res.ok) throw new Error("Could not load buyers.");
      const data = await res.json();
      return data.buyers;
    },
    staleTime: 60_000,
  });
}

/** Saves a new buyer (or returns the existing one with the same name). */
export function useCreateBuyer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Buyer> => {
      const res = await fetch("/api/buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add the buyer.");
      return data.buyer;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buyers"] }),
  });
}
