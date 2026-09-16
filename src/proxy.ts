import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/server/session";

/**
 * Route gating (the previous app did this client-only, in ProtectedRoute.tsx
 * - this is a real robustness improvement, not just a port). This is an
 * "optimistic" check per Next's auth guidance: it only reads the JWT cookie,
 * never touches the database, so it stays cheap on every navigation.
 * Per-resource authorization still happens in every Route Handler/Server
 * Action via lib/server/authz.ts - this proxy is the first line of defense,
 * not the only one.
 */

function homeFor(role: string): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "md") return "/md/dashboard";
  return "/user/home";
}

const PUBLIC_PREFIXES = ["/login", "/share/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL(homeFor(session.role), request.url));
    }
    return NextResponse.next();
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }
  if (pathname.startsWith("/md") && session.role !== "md") {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }
  if (pathname.startsWith("/user") && (session.role === "admin" || session.role === "md")) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
