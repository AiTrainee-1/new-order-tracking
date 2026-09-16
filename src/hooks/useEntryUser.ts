"use client";

import { useAuth } from "@/context/AuthContext";
import { useDemoStore } from "@/context/DemoModeContext";
import { DEMO_USER } from "@/lib/demoData";

/** Who is making this entry - real work is attributed to the signed-in user.
 *  One hook, one guard: a null user means the caller shouldn't be able to
 *  submit at all, rather than silently writing an invalid empty-string id.
 *
 *  Inside a Preview sandbox this is the stand-in demo user instead, so the
 *  practice entries a form builds never carry a real user id, and so the forms
 *  (which refuse to submit without a user) stay usable regardless of who is
 *  looking at the preview. */
export function useEntryUser(): { id: string; name: string } | null {
  const demo = useDemoStore();
  const { appUser } = useAuth();
  if (demo) return DEMO_USER;
  return appUser ? { id: appUser.id, name: appUser.name } : null;
}
