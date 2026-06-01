"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Vista = "todos" | "general" | "politica";

const OPCIONES: Array<{ value: Vista; label: string; emoji: string; color: string }> = [
  { value: "todos", label: "Todos", emoji: "🌐", color: "#3b82f6" },
  { value: "general", label: "Normal", emoji: "🛒", color: "#10b981" },
  { value: "politica", label: "Política", emoji: "🏛", color: "#a855f7" },
];

interface Props {
  current: Vista;
}

/**
 * Selector global de vista — solo se monta para admins.
 * Cambiar vista hace POST /api/vista (setea cookie) y luego refresh.
 */
export default function VistaSelector({ current }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedOpt = OPCIONES.find((o) => o.value === current) || OPCIONES[0];

  async function setVista(v: Vista) {
    if (v === current) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/vista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vista: v }),
      });
      if (res.ok) {
        setOpen(false);
        // router.refresh() no recarga server components con cookies nuevas en 100% de los casos
        // window.location.reload garantiza que TODAS las queries se rehagan con la nueva cookie.
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" style={{ zIndex: 50 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium"
        style={{
          background: `${selectedOpt.color}15`,
          borderColor: `${selectedOpt.color}50`,
          color: "white",
        }}
      >
        <span className="flex items-center gap-2">
          <span>{selectedOpt.emoji}</span>
          <span className="truncate">{selectedOpt.label}</span>
        </span>
        <span className="text-[10px] text-[var(--muted)]">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} style={{ background: "transparent" }} />
          <div
            className="absolute left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg overflow-hidden shadow-2xl"
            style={{ backdropFilter: "blur(20px)" }}
          >
            {OPCIONES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVista(opt.value)}
                disabled={busy}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors ${
                  opt.value === current ? "bg-white/5" : ""
                }`}
              >
                <span>{opt.emoji}</span>
                <span className="text-white">{opt.label}</span>
                {opt.value === current && <span className="ml-auto text-[10px] text-[var(--purple-light)]">✓</span>}
              </button>
            ))}
            <div className="px-3 py-2 border-t border-[var(--card-border)] text-[10px] text-[var(--muted)]">
              Filtra todas las vistas del CRM por nicho.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
