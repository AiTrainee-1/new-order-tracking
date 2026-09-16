"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormControls";
import { Toggle } from "@/components/ui/FormControls";
import type { CreateUserInput } from "@/hooks/useUsers";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function UserForm({
  existingUsernames,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  existingUsernames: string[];
  onSubmit: (input: CreateUserInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error?: string | null;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [isMonitorOnly, setIsMonitorOnly] = useState(false);
  const [touched, setTouched] = useState(false);

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

  const isValid =
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    USERNAME_PATTERN.test(normalizedUsername) &&
    !usernameTaken &&
    password.length >= 6;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onSubmit({
      name: name.trim(),
      username: normalizedUsername,
      password,
      role: role.trim(),
      phone: phone.trim(),
      isMonitorOnly,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        label="Role / Designation"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="e.g. Cutting Master, Merchandiser"
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          error={usernameError}
        />
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            error={passwordError}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-8 text-xs font-semibold text-ink-500 hover:text-brand"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <p className="text-xs text-ink-500">
        Minimum 6 characters. The username becomes their login - it can&apos;t be changed later.
      </p>

      <Input
        label="Phone Number"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="e.g. +91 98765 43210"
      />
      <p className="text-xs text-ink-500">Shown to teammates handing off work to or from this person.</p>

      <Toggle
        checked={isMonitorOnly}
        onChange={setIsMonitorOnly}
        label="Monitor Only"
        description="Can view assigned sections but cannot enter or modify production data."
      />

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          Create User
        </Button>
      </div>
    </form>
  );
}
