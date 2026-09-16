import type { HTMLAttributes, ReactNode } from "react";
import { GLASS_CARD_NEO } from "@/lib/theme";

type CardProps = HTMLAttributes<HTMLDivElement>;

/** Frosted, neomorphic panel - the glass tint from before, now paired with a
 * genuine dual light/dark shadow so it visibly lifts off the spatial
 * backdrop instead of just tinting it. Kept at 80% white so dense tables and
 * long numbers stay fully legible. */
export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div className={`${GLASS_CARD_NEO} transition-shadow duration-200 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/70 px-6 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-extrabold tracking-tight text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-xs font-medium text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}
