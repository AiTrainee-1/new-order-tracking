"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

/**
 * A render-prop active-link, replacing react-router's `<NavLink>` (which has
 * no Next.js built-in equivalent) - `next/link` plus `usePathname()`
 * comparison, wrapped so call sites keep the exact
 * `{(isActive) => ...}` ergonomics the ported layout components already use.
 */
export function NavLink({
  href,
  onClick,
  title,
  className,
  style,
  children,
}: {
  href: string;
  onClick?: () => void;
  title?: string;
  className: (isActive: boolean) => string;
  style?: (isActive: boolean) => CSSProperties | undefined;
  children: (isActive: boolean) => ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link href={href} onClick={onClick} title={title} className={className(isActive)} style={style?.(isActive)}>
      {children(isActive)}
    </Link>
  );
}
