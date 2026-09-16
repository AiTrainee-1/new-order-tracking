"use client";

import type { ReactNode } from "react";
import { SHADOW_PANEL } from "@/lib/theme";

export function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  widthClass?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 pt-12 backdrop-blur-sm sm:pt-20"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClass} animate-fadeInUp rounded-3xl border border-white/70 bg-white/90 backdrop-blur-2xl ${SHADOW_PANEL}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/70 px-5 py-4">
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
