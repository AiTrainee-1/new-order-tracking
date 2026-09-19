import type { PublicAppUser } from "./types";

/** Whether the person was last active on today's calendar date. */
export function isActiveToday(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  return new Date(lastActivityAt).toDateString() === new Date().toDateString();
}

/** Where an account stands right now - every account is in exactly one, so
 *  the Users overview's counts, its filter tabs and the cards all agree. */
export type UserActivity = "today" | "active" | "inactive";

export function userActivity(user: Pick<PublicAppUser, "isActive" | "lastActivityAt">): UserActivity {
  if (!user.isActive) return "inactive";
  return isActiveToday(user.lastActivityAt) ? "today" : "active";
}

/** Name, username, role, phone, or the label of anything they're assigned to. */
export function userMatchesSearch(user: Pick<PublicAppUser, "name" | "username" | "role" | "phone">, sections: string[], query: string): boolean {
  return [user.name, user.username, user.role, user.phone, ...sections].some((value) => value?.toLowerCase().includes(query));
}
