"use client";

import { useState } from "react";
import type { PublicAppUser } from "@/lib/types";
import { isActiveToday, userActivity, type UserActivity } from "@/lib/users";
import { formatDisplayDate } from "@/lib/workflow";
import { cardStatusAccent, cardStatusBorder, cardStatusShadow, cardStatusSoftBg, type CardStatusTone } from "@/lib/theme";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

/** Green = active today, blue = enabled but not seen today, grey = inactive -
 *  the same three-colour language the overview above the list uses. */
const TONE: Record<UserActivity, CardStatusTone> = { today: "completed", active: "started", inactive: "notStarted" };

/**
 * One account on the admin Users page: who they are, what they can do, when
 * they were last seen, and the account actions. The card is tinted by
 * activity, the same skin as every other card in the app. Clicking the
 * Active/Inactive pill toggles the account, as it always has; the password
 * is masked until "View" is clicked (local to the card, so revealing one
 * never reveals another).
 */
export function UserAdminCard({
  user,
  sections,
  isSelf,
  onToggleActive,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  user: PublicAppUser;
  sections: string[];
  isSelf: boolean;
  onToggleActive: (user: PublicAppUser) => void;
  onEdit: (user: PublicAppUser) => void;
  onResetPassword: (user: PublicAppUser) => void;
  onDelete: (user: PublicAppUser) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const tone = TONE[userActivity(user)];
  const accent = cardStatusAccent[tone];

  return (
    <div style={cardStatusSoftBg[tone]} className={`relative flex animate-fadeInUp flex-col gap-4 overflow-hidden rounded-2xl border p-5 ${cardStatusBorder[tone]} ${cardStatusShadow[tone]}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />

      <div className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-md" style={{ backgroundColor: accent }}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold tracking-tight text-ink-900">
            <span className="truncate">{user.name}</span>
            {isSelf && <Badge tone="brand">You</Badge>}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-600" title={`@${user.username} · ${user.role}`}>
            @{user.username} · {user.role}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleActive(user)}
          title={user.isActive ? "Click to deactivate" : "Click to activate"}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-85"
          style={{ backgroundColor: user.isActive ? "#059669" : "#64748B" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
          {user.isActive ? "Active" : "Inactive"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Phone</p>
          <p className="truncate text-sm font-semibold text-ink-900">
            {user.phone ? (
              <a href={`tel:${user.phone}`} className="hover:text-brand">
                {user.phone}
              </a>
            ) : (
              <span className="font-medium text-ink-400">Not on file</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Access</p>
          <p className="truncate text-sm font-semibold text-ink-900">{user.isMonitorOnly ? "Monitor only" : "Can enter data"}</p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Last activity</p>
          {/* "Today" rather than today's date plus a badge: both together don't
              fit a half-width tile, and the date adds nothing when it's today. */}
          <p className={`truncate text-sm font-semibold ${isActiveToday(user.lastActivityAt) ? "text-status-good" : "text-ink-900"}`}>
            {isActiveToday(user.lastActivityAt) ? "Today" : formatDisplayDate(user.lastActivityAt)}
          </p>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Password</p>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <span className="truncate font-mono">{revealed ? user.passwordPlain : "••••••••"}</span>
            <button type="button" onClick={() => setRevealed((v) => !v)} className="shrink-0 text-xs font-semibold text-brand hover:underline">
              {revealed ? "Hide" : "View"}
            </button>
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">Assigned sections</p>
        {sections.length ? (
          <div className="flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <Badge key={s} tone="neutral">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-400">None assigned</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-black/10 pt-3">
        <Button size="sm" variant="secondary" onClick={() => onEdit(user)}>
          Edit
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onResetPassword(user)}>
          Reset Password
        </Button>
        {!isSelf && (
          <Button size="sm" variant="ghost" className="text-status-bad hover:bg-red-50" onClick={() => onDelete(user)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
