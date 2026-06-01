"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Vista = "todos" | "general" | "politica";

const VISTAS: Array<{
  value: Vista;
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  glow: string;
}> = [
  {
    value: "general",
    emoji: "🛒",
    title: "ROMS Normal",
    subtitle: "Ecommerce y negocios",
    description: "Operación habitual: clientes de Omnipresencia, Multicuentas, Consultoría y ROMS 7.",
    accent: "#10b981",
    glow: "rgba(16, 185, 129, 0.30)",
  },
  {
    value: "politica",
    emoji: "🏛",
    title: "ROMS Política",
    subtitle: "Campañas y asesoramiento",
    description: "Clientes del vertical político. Aislado de la operación normal — no se mezcla.",
    accent: "#a855f7",
    glow: "rgba(168, 85, 247, 0.30)",
  },
  {
    value: "todos",
    emoji: "🌐",
    title: "Ver todo",
    subtitle: "Vista combinada",
    description: "Sin filtro de nicho. Muestra todos los leads y métricas mezcladas. Útil para análisis.",
    accent: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.20)",
  },
];

export default function SeleccionarVistaClient({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Vista | null>(null);

  async function elegir(v: Vista) {
    setBusy(v);
    try {
      const res = await fetch("/api/vista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vista: v }),
      });
      if (res.ok) {
        // Hard reload así todas las queries del server reciben la nueva cookie
        window.location.assign("/");
      } else {
        setBusy(null);
      }
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Mesh background sutil */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 30% 30%, var(--mesh-a), transparent 50%),
            radial-gradient(circle at 70% 70%, var(--mesh-b), transparent 50%)
          `,
          opacity: 0.4,
        }}
      />

      <div className="relative z-10 w-full max-w-5xl">
        <div className="text-center mb-10">
          <p className="text-sm text-[var(--muted)] mb-2">Hola, {nombre} 👋</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            ¿Qué CRM querés abrir?
          </h1>
          <p className="text-sm text-[var(--muted)] max-w-xl mx-auto">
            Elegí en cuál vas a trabajar ahora. Todo lo que veas (cobranzas, finanzas, llamadas, métricas)
            queda filtrado por esa opción. Podés cambiar después desde el sidebar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {VISTAS.map((v) => {
            const isBusy = busy === v.value;
            return (
              <button
                key={v.value}
                onClick={() => elegir(v.value)}
                disabled={busy !== null}
                className="group relative bg-[var(--card-bg)] border-2 rounded-2xl p-6 text-left transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-wait"
                style={{
                  borderColor: `${v.accent}40`,
                  boxShadow: `0 0 0 0 ${v.glow}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = v.accent;
                  e.currentTarget.style.boxShadow = `0 8px 32px 0 ${v.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = `${v.accent}40`;
                  e.currentTarget.style.boxShadow = `0 0 0 0 ${v.glow}`;
                }}
              >
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: `linear-gradient(135deg, ${v.accent}10, transparent)` }}
                />
                <div className="relative">
                  <div className="text-6xl mb-4">{v.emoji}</div>
                  <h2 className="text-2xl font-bold text-white mb-1" style={{ color: v.accent }}>
                    {v.title}
                  </h2>
                  <p className="text-sm text-[var(--muted)] font-medium mb-3">{v.subtitle}</p>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{v.description}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xs font-medium text-white opacity-70 group-hover:opacity-100 transition-opacity">
                      {isBusy ? "Entrando..." : "Entrar →"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-[var(--muted)] mt-8">
          Esta pantalla aparece después del login. Podés volver acá desde el sidebar (botón "Cambiar app").
        </p>
      </div>
    </div>
  );
}
