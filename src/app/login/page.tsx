"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/ui/BrandMark";
import {
  authBackground,
  brandGradient,
  dotTexture,
  glassSheen,
  headingGradientStrong,
  iconGradient,
  SHADOW_NEO_RAISED_LG,
  type IconTone,
} from "@/lib/theme";

/** Where a signed-in user lands, by role. proxy.ts already keeps an
 *  authenticated visitor from reaching this page at all, so this is only
 *  used right after a successful sign-in. */
function homeFor(role: string): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "md") return "/md/dashboard";
  return "/user/home";
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(username, password);
      router.replace(homeFor(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={authBackground}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.5]" style={dotTexture} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-10 px-5 py-12 lg:flex-row lg:justify-between lg:gap-16 lg:px-8">
        {/* Brand side - dark text on the light mesh. */}
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center rounded-2xl border border-white/80 bg-white px-2.5 py-2 shadow-lg shadow-blue-900/10">
              <BrandMark size={30} />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-ink-900">UK TEXTILES</p>
              <p className="text-xs font-medium text-ink-500">Excellence in Every Thread</p>
            </div>
          </div>

          <h1 className="mt-10 text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl">
            Garment order tracking,{" "}
            <span className="bg-clip-text text-transparent" style={headingGradientStrong}>
              simplified.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-600 sm:text-base">
            Track every order from PO to packing across the full production workflow - in real
            time, with a stage sequence you configure per order.
          </p>

          <div className="mt-9 grid gap-3 sm:max-w-md">
            <FeaturePill icon="📦" tone="sky" text="Lot & size-wise tracking, yarn to carton" />
            <FeaturePill icon="⏱" tone="amber" text="Live delivery countdowns & urgency alerts" />
            <FeaturePill icon="👥" tone="emerald" text="Role-based assignments, monitor-only access" />
          </div>

          <p className="mt-10 hidden text-xs text-ink-400 lg:block">
            © {new Date().getFullYear()} UK Textiles. All rights reserved.
          </p>
        </div>

        {/* Frosted sign-in panel */}
        <div className="w-full max-w-md">
          <div className={`relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/65 p-7 backdrop-blur-2xl sm:p-9 ${SHADOW_NEO_RAISED_LG}`}>
            <div className="pointer-events-none absolute inset-0 opacity-70" style={glassSheen} />
            <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-400/25 blur-2xl" />
            <span className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-sky-400/25 blur-2xl" />

            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-dark shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Secure sign in
              </span>

              <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">Welcome back</h2>
              <p className="mt-1 text-sm text-ink-600">Sign in to continue to your workspace.</p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <GlassField
                  icon={<UserIcon />}
                  placeholder="Username"
                  autoFocus
                  value={username}
                  onChange={setUsername}
                  autoComplete="username"
                />

                <GlassField
                  icon={<LockIcon />}
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="rounded-lg p-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  }
                />

                {error && (
                  <p className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={brandGradient}
                  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 py-3.5 text-base font-semibold text-white shadow-[0_12px_30px_-8px_rgba(21,94,239,0.65)] transition-all hover:brightness-110 hover:shadow-[0_16px_40px_-8px_rgba(21,94,239,0.75)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                    style={{ filter: "url(#uk-goo)" }}
                  >
                    <span className="absolute bottom-0 left-[-6%] h-full w-[38%] origin-bottom scale-125 translate-y-[130%] rounded-full bg-[#2F7BFF] transition-transform duration-500 ease-out group-hover:translate-y-0" />
                    <span className="absolute bottom-0 left-[32%] h-full w-[38%] origin-bottom scale-125 translate-y-[130%] rounded-full bg-[#2F7BFF] transition-transform duration-500 ease-out [transition-delay:60ms] group-hover:translate-y-0" />
                    <span className="absolute bottom-0 left-[68%] h-full w-[38%] origin-bottom scale-125 translate-y-[130%] rounded-full bg-[#2F7BFF] transition-transform duration-500 ease-out [transition-delay:25ms] group-hover:translate-y-0" />
                  </span>
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {submitting && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                    )}
                    {submitting ? "Signing in…" : "Sign In"}
                  </span>
                </button>
              </form>
            </div>
          </div>

          <p className="mt-6 text-center text-xs font-medium text-ink-500">
            Having trouble signing in? Contact your Host Admin.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ icon, tone, text }: { icon: ReactNode; tone: IconTone; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/55 px-4 py-3 shadow-[0_8px_20px_-12px_rgba(30,41,90,0.4)] backdrop-blur-md transition-colors hover:bg-white/75">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-md"
        style={iconGradient[tone]}
      >
        {icon}
      </span>
      <p className="text-sm font-semibold text-ink-800">{text}</p>
    </div>
  );
}

/** Frosted single-line field: icon inside, placeholder as the label, inset
 * shadow so it reads as pressed into the glass - not a stacked form row. */
function GlassField({
  icon,
  trailing,
  value,
  onChange,
  ...rest
}: {
  icon: ReactNode;
  trailing?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="group relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-ink-500 transition-colors group-focus-within:text-brand">
        {icon}
      </span>
      <input
        {...rest}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-2xl border border-white/90 bg-white/85 py-3.5 pl-12 text-sm font-semibold text-ink-900 shadow-[inset_0_1px_3px_rgba(16,24,40,0.08)] outline-none transition-all placeholder:font-normal placeholder:text-ink-400 focus:border-brand/50 focus:bg-white focus:shadow-[0_0_0_4px_rgba(21,94,239,0.16),inset_0_1px_3px_rgba(16,24,40,0.05)] ${
          trailing ? "pr-12" : "pr-4"
        }`}
      />
      {trailing && <span className="absolute right-3 top-1/2 z-10 -translate-y-1/2">{trailing}</span>}
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="8" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="10" width="16" height="10" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.36 5.6C10.2 5.2 11.08 5 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-3.22 4.06M6.6 6.6A13.6 13.6 0 0 0 2 12s3.5 7 10 7c1.06 0 2.06-.18 3-.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
