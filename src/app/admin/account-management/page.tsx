"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useToast } from "@/context/ToastContext";
import { useCreateUser, useResetPassword, useUpdateUser, useUsers } from "@/hooks/useUsers";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { Loader } from "@/components/ui/Loader";
import { PageHero } from "@/components/ui/SectionCard";
import { formatDisplayDate } from "@/lib/workflow";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export default function AccountManagementPage() {
  const toast = useToast();
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();

  const mdUsers = useMemo(() => (users ?? []).filter((u) => u.role === "md"), [users]);
  const existingUsernames = useMemo(() => (users ?? []).map((u) => u.username.toLowerCase()), [users]);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const normalizedUsername = username.trim().toLowerCase();
  const usernameTaken = existingUsernames.includes(normalizedUsername);
  const usernameError = !touched
    ? undefined
    : !normalizedUsername
      ? "Username is required."
      : !USERNAME_PATTERN.test(normalizedUsername)
        ? "3-32 characters: lowercase letters, numbers, dots, underscores, or hyphens only."
        : usernameTaken
          ? "This username is already in use."
          : undefined;
  const passwordError =
    touched && password.length > 0 && password.length < 6
      ? "Password must be at least 6 characters."
      : touched && password.length === 0
        ? "Password is required."
        : undefined;
  const isValid = name.trim().length > 0 && USERNAME_PATTERN.test(normalizedUsername) && !usernameTaken && password.length >= 6;

  function resetCreateForm() {
    setName("");
    setUsername("");
    setPassword("");
    setTouched(false);
    setCreateError(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    setCreateError(null);
    try {
      await createUser.mutateAsync({
        name: name.trim(),
        username: normalizedUsername,
        password,
        role: "md",
        phone: "",
        isMonitorOnly: false,
      });
      toast.success(`MD account "${name.trim()}" created.`);
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create MD account.");
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

  return (
    <div className="space-y-5">
      <PageHero
        icon="🛡️"
        iconBg="linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)"
        title="Account Management"
        titleGradient="linear-gradient(100deg, #7C3AED 0%, #DB2777 60%, #E11D48 100%)"
        description="MD (Managing Director) accounts - read-only login, fleet-wide visibility."
        action={<Button onClick={() => setShowCreate(true)}>+ Add MD Account</Button>}
      />

      {isLoading && <Loader label="Loading accounts…" />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mdUsers.map((mdUser, i) => (
          <Card
            key={mdUser.id}
            className="relative animate-fadeInUp overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-12px_rgba(15,23,42,0.25)]"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, animationFillMode: "backwards" }}
          >
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: mdUser.isActive ? "#059669" : "#94A3B8" }} />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-[0_6px_14px_-6px_rgba(124,58,237,0.5)]"
                  style={{ backgroundImage: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)" }}
                >
                  {mdUser.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-900">{mdUser.name}</p>
                  <p className="text-xs text-ink-500">@{mdUser.username}</p>
                </div>
              </div>
              <Badge tone={mdUser.isActive ? "good" : "bad"}>{mdUser.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            <div className="mt-3 space-y-1.5 rounded-lg bg-gradient-to-br from-violet-50/60 to-white p-2.5 text-xs text-ink-600">
              <p className="flex items-center gap-1.5">
                <span className="font-semibold text-ink-500">Password:</span>
                <span className="font-mono">{revealedIds.has(mdUser.id) ? mdUser.passwordPlain : "••••••••"}</span>
                <button
                  className="font-semibold text-brand hover:underline"
                  onClick={() =>
                    setRevealedIds((prev) => {
                      const next = new Set(prev);
                      next.has(mdUser.id) ? next.delete(mdUser.id) : next.add(mdUser.id);
                      return next;
                    })
                  }
                >
                  {revealedIds.has(mdUser.id) ? "Hide" : "View"}
                </button>
              </p>
              <p>
                <span className="font-semibold text-ink-500">Last activity: </span>
                {formatDisplayDate(mdUser.lastActivityAt)}
              </p>
            </div>
            <div className="mt-3 flex gap-1.5 border-t border-ink-100 pt-3">
              <Button size="sm" variant="secondary" onClick={() => { setResetTarget(mdUser); setNewPassword(""); setResetError(null); }}>
                Reset Password
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateUser.mutate({ id: mdUser.id, isActive: !mdUser.isActive })}
              >
                {mdUser.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetCreateForm(); }} title="Add MD Account">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} error={usernameError} autoComplete="off" />
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-8 text-xs font-semibold text-ink-500 hover:text-brand">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-ink-500">Minimum 6 characters. The username becomes their login - it can&apos;t be changed later.</p>
          {createError && <p className="text-sm text-status-bad">{createError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); resetCreateForm(); }}>Cancel</Button>
            <Button type="submit" isLoading={createUser.isPending}>Create MD Account</Button>
          </div>
        </form>
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
    </div>
  );
}
