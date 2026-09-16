"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/** App-wide confirmation dialog. `await confirm({...})` resolves true if the
 * user accepts, false if they cancel/dismiss - used to gate irreversible
 * actions like forwarding a stage to completion (which unlocks later stages). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: "" });
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal open={open} onClose={() => settle(false)} title={options.title ?? "Please confirm"}>
        <div className="space-y-5">
          <div className="text-sm leading-relaxed text-ink-600">{options.message}</div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => settle(false)}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={options.tone === "danger" ? "danger" : "primary"}
              onClick={() => settle(true)}
              autoFocus
            >
              {options.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
