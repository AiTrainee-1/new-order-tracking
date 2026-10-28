"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SHADOW_PANEL } from "@/lib/theme";

/** Open dialogs, innermost last - so Escape only closes the top one when a
 *  confirm opens over another modal. */
const openDialogs: symbol[] = [];

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
    <ModalDialog onClose={onClose} title={title} widthClass={widthClass}>
      {children}
    </ModalDialog>
  );
}

/** The dialog itself - mounted only while open, so taking focus on the way in
 *  and handing it back on the way out are just its mount and unmount. */
function ModalDialog({ onClose, title, children, widthClass }: { onClose: () => void; title: string; children: ReactNode; widthClass: string }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // Whatever had focus before the dialog opened - read while rendering, since
  // an autoFocus inside the dialog takes focus before any effect runs.
  const [returnFocusTo] = useState(() => (typeof document !== "undefined" ? document.activeElement : null));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = Symbol("dialog");
    openDialogs.push(id);

    // Move focus into the dialog, unless something in it (an autoFocus field
    // or button) already took it.
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    function onKeyDown(e: KeyboardEvent) {
      // A dropdown inside the dialog that handled Escape itself (closing its
      // list) marks it handled - leave the dialog open then.
      if (e.key !== "Escape" || e.defaultPrevented || openDialogs[openDialogs.length - 1] !== id) return;
      e.preventDefault();
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openDialogs.splice(openDialogs.indexOf(id), 1);
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus();
    };
  }, [returnFocusTo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 pt-12 backdrop-blur-sm sm:pt-20"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
        className={`w-full ${widthClass} animate-fadeInUp rounded-3xl border border-white/70 bg-white/90 outline-none backdrop-blur-2xl ${SHADOW_PANEL}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/70 px-5 py-4">
          <h2 id={titleId} className="text-sm font-bold text-ink-900">
            {title}
          </h2>
          <button
            type="button"
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
