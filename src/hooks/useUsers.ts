"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicAppUser } from "@/lib/types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export function useUsers() {
  return useQuery({
    queryKey: ["app_users"],
    queryFn: async () => (await jsonFetch<{ users: PublicAppUser[] }>("/api/users")).users,
  });
}

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: string;
  phone: string;
  isMonitorOnly: boolean;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      jsonFetch("/api/users", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app_users"] }),
  });
}

export interface UpdateUserInput {
  id: string;
  name?: string;
  role?: string;
  phone?: string | null;
  isMonitorOnly?: boolean;
  isActive?: boolean;
  canCreateOrders?: boolean;
  canJobWork?: boolean;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateUserInput) =>
      jsonFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app_users"] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { userId: string; newPassword: string }) =>
      jsonFetch(`/api/users/${input.userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: input.newPassword }),
      }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string }) => jsonFetch(`/api/users/${input.userId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app_users"] }),
  });
}
