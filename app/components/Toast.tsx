"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  show: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback to alert if provider missing — fail-safe.
    const show = (m: string) => {
      if (typeof window !== "undefined") window.alert(m);
    };
    return { show, success: show, error: show, info: show };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev, { id, kind, message }]);
    const ttl = kind === "error" ? 6000 : 3500;
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), ttl);
  }, []);

  const success = useCallback((m: string) => show(m, "success"), [show]);
  const error = useCallback((m: string) => show(m, "error"), [show]);
  const info = useCallback((m: string) => show(m, "info"), [show]);

  return (
    <Ctx.Provider value={{ show, success, error, info }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {items.map((t) => {
          const accent = t.kind === "success" ? "#34D399" : t.kind === "error" ? "#FB7185" : "#60A5FA";
          return (
            <div
              key={t.id}
              role="status"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              style={{
                pointerEvents: "auto",
                minWidth: 280,
                maxWidth: 460,
                padding: "10px 18px",
                borderRadius: 100,
                background: "rgba(20,20,30,0.85)",
                backdropFilter: "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                animation: "toastIslandIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: accent,
                  boxShadow: `0 0 8px ${accent}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{t.message}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastIslandIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.6); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </Ctx.Provider>
  );
}

// Confirm dialog — promise-based, reemplaza window.confirm()
interface ConfirmCtx {
  ask: (opts: { title: string; description?: string; confirmLabel?: string; destructive?: boolean }) => Promise<boolean>;
}
const CCtx = createContext<ConfirmCtx | null>(null);

export function useConfirm(): ConfirmCtx["ask"] {
  const ctx = useContext(CCtx);
  return ctx
    ? ctx.ask
    : async ({ title, description }) => {
        if (typeof window === "undefined") return false;
        return window.confirm(`${title}${description ? "\n\n" + description : ""}`);
      };
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<{
    title: string;
    description?: string;
    confirmLabel: string;
    destructive: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);

  const ask: ConfirmCtx["ask"] = useCallback((opts) => {
    return new Promise<boolean>((resolve) => {
      setOpen({
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel || "Confirmar",
        destructive: !!opts.destructive,
        resolve,
      });
    });
  }, []);

  // Esc to cancel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        open.resolve(false);
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close(v: boolean) {
    if (open) {
      open.resolve(v);
      setOpen(null);
    }
  }

  return (
    <CCtx.Provider value={{ ask }}>
      {children}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => close(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-base font-semibold text-white mb-2">{open.title}</h3>
            {open.description && (
              <p className="text-sm text-[var(--muted)] mb-5 whitespace-pre-line">{open.description}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-sm hover:border-[var(--muted)] hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => close(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  open.destructive
                    ? "bg-[var(--red)] hover:bg-[var(--red)]/80"
                    : "bg-[var(--purple)] hover:bg-[var(--purple-dark)]"
                }`}
                autoFocus
              >
                {open.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </CCtx.Provider>
  );
}
