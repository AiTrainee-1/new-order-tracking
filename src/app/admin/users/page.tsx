"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useAssignments } from "@/hooks/useAssignments";
import { useCreateUser, useDeleteUser, useResetPassword, useUpdateUser, useUsers, type CreateUserInput } from "@/hooks/useUsers";
import { UserForm } from "@/components/forms/UserForm";
import { UsersAdminView } from "@/components/users/UsersAdminView";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import type { PublicAppUser } from "@/lib/types";

/** Users - every account, with its create/edit/reset-password/delete dialogs.
 *  The overview, search and cards live in UsersAdminView; this route owns the
 *  data, the mutations and the modals. */
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
    return new Map(Array.from(map, ([userId, labels]) => [userId, Array.from(labels)] as const));
  }, [assignments]);

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

  return (
    <>
      <UsersAdminView
        users={users}
        isLoading={isLoading}
        currentUserId={appUser?.id}
        sectionsByUser={sectionsByUser}
        onAdd={() => setShowCreate(true)}
        onToggleActive={(user) => updateUser.mutate({ id: user.id, isActive: !user.isActive })}
        onEdit={(user) => {
          setEditTarget(user);
          setEditName(user.name);
          setEditRole(user.role);
          setEditPhone(user.phone ?? "");
          setEditError(null);
        }}
        onResetPassword={(user) => {
          setResetTarget(user);
          setNewPassword("");
          setResetError(null);
        }}
        onDelete={(user) => {
          setDeleteTarget(user);
          setDeleteError(null);
        }}
      />

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
    </>
  );
}
