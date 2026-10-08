"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, FocusEventHandler, MouseEventHandler, ReactNode } from "react";

/**
 * A render-prop active-link, replacing react-router's `<NavLink>` (which has
 * no Next.js built-in equivalent) - `next/link` plus `usePathname()`
 * comparison, wrapped so call sites keep the exact
 * `{(isActive) => ...}` ergonomics the ported layout components already use.
 */
export function NavLink({
  href,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  title,
  ariaLabel,
  className,
  style,
  children,
}: {
  href: string;
  onClick?: () => void;
  onMouseEnter?: MouseEventHandler<HTMLAnchorElement>;
  onMouseLeave?: MouseEventHandler<HTMLAnchorElement>;
  onFocus?: FocusEventHandler<HTMLAnchorElement>;
  onBlur?: FocusEventHandler<HTMLAnchorElement>;
  title?: string;
  ariaLabel?: string;
  className: (isActive: boolean) => string;
  style?: (isActive: boolean) => CSSProperties | undefined;
  children: (isActive: boolean) => ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      title={title}
      aria-label={ariaLabel}
      aria-current={isActive ? "page" : undefined}
      className={className(isActive)}
      style={style?.(isActive)}
    >
      {children(isActive)}
    </Link>
  );
}
