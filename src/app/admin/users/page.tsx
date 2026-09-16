"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useAssignments } from "@/hooks/useAssignments";
import { useCreateUser, useDeleteUser, useResetPassword, useUpdateUser, useUsers, type CreateUserInput } from "@/hooks/useUsers";
import { UserForm } from "@/components/forms/UserForm";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { Loader } from "@/components/ui/Loader";
import { formatDisplayDate } from "@/lib/workflow";
import { cardStatusAccent } from "@/lib/theme";
import type { PublicAppUser } from "@/lib/types";

function isActiveToday(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  return new Date(lastActivityAt).toDateString() === new Date().toDateString();
}

function userTone(user: PublicAppUser): "completed" | "started" | "notStarted" {
  if (!user.isActive) return "notStarted";
  return isActiveToday(user.lastActivityAt) ? "completed" : "started";
}

export default function UsersPage() {
  const { appUser } = useAuth();
  const toast = useToast();
  const { data: users, isLoading } = useUsers();
  const { data: assignments } = useAssignments();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();
  const deleteUser = useDeleteUser();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [resetTarget, setResetTarget] = useState<PublicAppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicAppUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<PublicAppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const sectionsByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of assignments ?? []) {
      const set = map.get(a.userId) ?? new Set<string>();
      if (a.section?.label) set.add(a.section.label);
      map.set(a.userId, set);
    }
    return map;
  }, [assignments]);

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(input: CreateUserInput) {
    setCreateError(null);
    try {
      await createUser.mutateAsync(input);
      setShowCreate(false);
      toast.success(`User "${input.name}" created successfully.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create user.";
      setCreateError(message);
      toast.error(message);
    }
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setEditError(null);
    try {
      await updateUser.mutateAsync({ id: editTarget.id, name: editName.trim(), role: editRole.trim(), phone: editPhone.trim() || null });
      setEditTarget(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save changes.");
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    try {
      await resetPassword.mutateAsync({ userId: resetTarget.id, newPassword });
      toast.success(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setNewPassword("");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not reset password.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteUser.mutateAsync({ userId: deleteTarget.id });
      toast.success(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete user.");
    }
  }

  const totalUsers = users?.length ?? 0;
  const activeUsers = users?.filter((u) => u.isActive).length ?? 0;
  const activeToday = users?.filter((u) => isActiveToday(u.lastActivityAt)).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Users</h1>
          <p className="mt-1 text-sm text-ink-600">Everyone with a login, across every role.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add User</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={totalUsers} icon="👥" />
        <StatCard label="Active Accounts" value={activeUsers} tone="good" icon="✓" />
        <StatCard label="Active Today" value={activeToday} tone="brand" icon="⚡" />
      </div>

      {isLoading && <Loader label="Loading users…" />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {users?.map((user) => {
          const isSelf = user.id === appUser?.id;
          const tone = userTone(user);
          const sections = Array.from(sectionsByUser.get(user.id) ?? []);
          return (
            <Card key={user.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: cardStatusAccent[tone === "completed" ? "completed" : tone === "started" ? "started" : "notStarted"] }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink-900">
                      {user.name}
                      {isSelf && <Badge tone="brand">You</Badge>}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      @{user.username} · {user.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateUser.mutate({ id: user.id, isActive: !user.isActive })}
                  className="shrink-0"
                  title="Toggle active"
                >
                  <Badge tone={user.isActive ? "good" : "bad"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-ink-600">
                <p>
                  <span className="font-semibold text-ink-500">Phone: </span>
                  {user.phone ? <a href={`tel:${user.phone}`} className="hover:text-brand">{user.phone}</a> : "Not on file"}
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-semibold text-ink-500">Access:</span>
                  <Badge tone={user.isMonitorOnly ? "info" : "neutral"}>{user.isMonitorOnly ? "Monitor Only" : "Can Enter Data"}</Badge>
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-semibold text-ink-500">Last activity:</span>
                  {formatDisplayDate(user.lastActivityAt)}
                  {isActiveToday(user.lastActivityAt) && <Badge tone="brand">Today</Badge>}
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-semibold text-ink-500">Password:</span>
                  <span className="font-mono">{revealedIds.has(user.id) ? user.passwordPlain : "••••••••"}</span>
                  <button onClick={() => toggleReveal(user.id)} className="font-semibold text-brand hover:underline">
                    {revealedIds.has(user.id) ? "Hide" : "View"}
                  </button>
                </p>
                <div>
                  <span className="font-semibold text-ink-500">Assigned sections: </span>
                  {sections.length ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {sections.map((s) => (
                        <Badge key={s} tone="neutral">{s}</Badge>
                      ))}
                    </span>
                  ) : (
                    "None assigned"
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditTarget(user);
                    setEditName(user.name);
                    setEditRole(user.role);
                    setEditPhone(user.phone ?? "");
                    setEditError(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setResetTarget(user);
                    setNewPassword("");
                    setResetError(null);
                  }}
                >
                  Reset Password
                </Button>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-status-bad hover:bg-red-50"
                    onClick={() => {
                      setDeleteTarget(user);
                      setDeleteError(null);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add User">
        <UserForm
          existingUsernames={(users ?? []).map((u) => u.username.toLowerCase())}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitting={createUser.isPending}
          error={createError}
        />
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit ${editTarget?.name ?? ""}`}>
        <div className="space-y-4">
          <Input label="Full Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label="Role / Designation" value={editRole} onChange={(e) => setEditRole(e.target.value)} />
          <Input label="Phone Number" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="e.g. +91 98765 43210" />
          {editError && <p className="text-sm text-status-bad">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} isLoading={updateUser.isPending}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset password for ${resetTarget?.name ?? ""}`}>
        <div className="space-y-4">
          <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          {resetError && <p className="text-sm text-status-bad">{resetError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={handleResetPassword} isLoading={resetPassword.isPending}>Save Password</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete User">
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            This will permanently delete <b>{deleteTarget?.name}</b> (@{deleteTarget?.username}) and their login. This can&apos;t be undone.
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            If this user has ever submitted production entries, deletion will be blocked to protect the order history - deactivate them instead in that case.
          </p>
          {deleteError && <p className="text-sm text-status-bad">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteUser.isPending}>Delete Permanently</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
