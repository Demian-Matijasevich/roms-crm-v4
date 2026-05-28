"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthSession } from "@/lib/types";
import type { CoachingCloserSnapshot, CoachingLeadAlerta } from "./page";
import { useToast } from "@/app/components/Toast";

interface Props {
  snapshots: CoachingCloserSnapshot[];
  alertas: CoachingLeadAlerta[];
  session: AuthSession;
  fiscalStart: string;
  fiscalEnd: string;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

export default function CoachingClient({ snapshots, alertas, session, fiscalStart, fiscalEnd }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [filterCloser, setFilterCloser] = useState<string>("");
  const [activeApure, setActiveApure] = useState<string | null>(null);
  const [apureText, setApureText] = useState("");
  const [busy, setBusy] = useState(false);

  const alertasFiltradas = useMemo(() => {
    if (!filterCloser) return alertas;
    return alertas.filter((a) => a.closer_id === filterCloser);
  }, [alertas, filterCloser]);

  const totalCash = snapshots.reduce((s, c) => s + c.cash_mes_usd, 0);
  const totalCerrados = snapshots.reduce((s, c) => s + c.cerrados_mes, 0);
  const totalActivos = snapshots.reduce((s, c) => s + c.total_activos, 0);
  const totalAlertasRojas = alertas.filter((a) => a.motivo === "reserva_vencida" || a.motivo === "sin_movimiento_14d").length;

  async function enviarApure(leadId: string) {
    if (!apureText.trim()) {
      toast.error("Escribí el mensaje de apuro");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/coaching/apurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, mensaje: apureText }),
      });
      if (res.ok) {
        toast.success("Apuro registrado en notas internas");
        setActiveApure(null);
        setApureText("");
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error("Error: " + (json.error || "no se pudo guardar"));
      }
    } catch (err) {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  function motivoLabel(m: CoachingLeadAlerta["motivo"]) {
    if (m === "reserva_vencida") return "Reserva vencida";
    if (m === "sin_movimiento_14d") return "Frío 14d+";
    return "Frío 7d+";
  }

  function motivoColor(m: CoachingLeadAlerta["motivo"]) {
    if (m === "reserva_vencida") return "bg-red-500/20 text-red-300 border-red-500/40";
    if (m === "sin_movimiento_14d") return "bg-red-500/15 text-red-300 border-red-500/30";
    return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">🎯 Coaching de ventas</h1>
        <p className="text-sm text-[var(--muted)]">
          Vista de jefe de ventas. Periodo: {fiscalStart} → {fiscalEnd}
        </p>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Cash mes</p>
          <p className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(totalCash)}</p>
          <p className="text-[10px] text-[var(--muted)]">{totalCerrados} cierres</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Pipeline activo</p>
          <p className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{totalActivos}</p>
          <p className="text-[10px] text-[var(--muted)]">leads en juego</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Alertas rojas</p>
          <p className="text-2xl font-bold text-[var(--red)]" style={{ fontVariantNumeric: "tabular-nums" }}>{totalAlertasRojas}</p>
          <p className="text-[10px] text-[var(--muted)]">requieren intervención</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-[10px] uppercase text-[var(--muted)]">Total alertas</p>
          <p className="text-2xl font-bold text-amber-300" style={{ fontVariantNumeric: "tabular-nums" }}>{alertas.length}</p>
          <p className="text-[10px] text-[var(--muted)]">leads sin seguimiento</p>
        </div>
      </div>

      {/* Closers snapshot */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Closers · ranking del mes</h2>
          {filterCloser && (
            <button
              onClick={() => setFilterCloser("")}
              className="text-xs text-[var(--purple-light)] hover:text-white"
            >
              ✕ Quitar filtro
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="px-4 py-2">Closer</th>
                <th className="px-3 py-2 text-right">Cash mes</th>
                <th className="px-3 py-2 text-right">Cierres</th>
                <th className="px-3 py-2 text-right">Ticket avg</th>
                <th className="px-3 py-2 text-right">% cierre</th>
                <th className="px-3 py-2 text-right">Activos</th>
                <th className="px-3 py-2 text-right">Reservas</th>
                <th className="px-3 py-2 text-right">⚠️ Vencidas</th>
                <th className="px-3 py-2 text-right">⏰ Frío 7d+</th>
                <th className="px-3 py-2">Últ. llamada</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => {
                const isFiltered = filterCloser === s.id;
                const tieneAlertas = s.reservas_vencidas > 0 || s.sin_movimiento_7d > 0;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-[var(--card-border)]/40 hover:bg-white/5 cursor-pointer transition-colors ${isFiltered ? "bg-[var(--purple)]/10" : ""}`}
                    onClick={() => setFilterCloser(isFiltered ? "" : s.id)}
                  >
                    <td className="px-4 py-2.5 text-white font-medium">{s.nombre}</td>
                    <td className="px-3 py-2.5 text-right text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(s.cash_mes_usd)}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--muted)]">{s.cerrados_mes}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>{s.ticket_avg_mes > 0 ? fmt(s.ticket_avg_mes) : "—"}</td>
                    <td className={`px-3 py-2.5 text-right ${s.cierre_pct >= 40 ? "text-green-300" : s.cierre_pct >= 20 ? "text-amber-300" : "text-[var(--red)]"}`}>
                      {s.cierre_pct}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--muted)]">{s.total_activos}</td>
                    <td className="px-3 py-2.5 text-right text-amber-300">{s.reservas}</td>
                    <td className={`px-3 py-2.5 text-right ${s.reservas_vencidas > 0 ? "text-[var(--red)] font-semibold" : "text-[var(--muted)]"}`}>
                      {s.reservas_vencidas}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${s.sin_movimiento_7d > 0 ? "text-amber-300 font-semibold" : "text-[var(--muted)]"}`}>
                      {s.sin_movimiento_7d}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)] text-xs">{fmtDate(s.ultima_llamada)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-[10px] text-[var(--muted)] border-t border-[var(--card-border)]">
          Click sobre un closer para filtrar las alertas de abajo. % cierre = cerrados mes / (cerrados+no_cierre+reserva+broke históricos)
        </div>
      </div>

      {/* Alertas */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">🔥 Leads que requieren acción</h2>
            <p className="text-xs text-[var(--muted)]">
              {alertasFiltradas.length} alertas {filterCloser && "(filtrado)"}
            </p>
          </div>
        </div>
        {alertasFiltradas.length === 0 ? (
          <p className="text-sm text-[var(--muted)] p-8 text-center">Sin alertas activas 🎉</p>
        ) : (
          <div className="divide-y divide-[var(--card-border)]/40">
            {alertasFiltradas.slice(0, 50).map((a) => (
              <div key={a.id + a.motivo} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${motivoColor(a.motivo)}`}>
                      {motivoLabel(a.motivo)} · {a.dias}d
                    </span>
                    <Link href={`/llamadas/${a.id}/estado-cuenta`} className="text-white font-medium hover:text-[var(--purple-light)]">
                      {a.nombre}
                    </Link>
                    <span className="text-xs text-[var(--muted)]">
                      {a.closer_nombre} · {a.estado}
                    </span>
                    {a.ticket_total > 0 && (
                      <span className="text-xs text-[var(--muted)] font-mono">{fmt(a.ticket_total)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeApure !== a.id && (
                      <button
                        onClick={() => setActiveApure(a.id)}
                        className="text-xs px-3 py-1.5 bg-[var(--purple)]/20 hover:bg-[var(--purple)]/30 text-[var(--purple-light)] rounded-lg transition-colors"
                      >
                        ⚡ Apurar
                      </button>
                    )}
                    <Link
                      href={`/llamadas/${a.id}/estado-cuenta`}
                      className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white rounded-lg transition-colors"
                    >
                      Ver →
                    </Link>
                  </div>
                </div>
                {a.fecha_llamada && (
                  <p className="text-[11px] text-[var(--muted)] mt-1.5">
                    Últ. llamada {fmtDate(a.fecha_llamada)}
                    {a.fecha_cierre_estimada && ` · Cierre estimado ${fmtDate(a.fecha_cierre_estimada)}`}
                  </p>
                )}
                {activeApure === a.id && (
                  <div className="mt-3 p-3 bg-white/5 border border-[var(--card-border)] rounded-lg">
                    <textarea
                      value={apureText}
                      onChange={(e) => setApureText(e.target.value)}
                      placeholder={`Mensaje para ${a.closer_nombre} — quedará en notas internas del lead`}
                      className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white outline-none resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => enviarApure(a.id)}
                        disabled={busy || !apureText.trim()}
                        className="text-xs px-3 py-1.5 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white rounded-lg"
                      >
                        {busy ? "..." : "Registrar apuro"}
                      </button>
                      <button
                        onClick={() => {
                          setActiveApure(null);
                          setApureText("");
                        }}
                        className="text-xs px-3 py-1.5 bg-white/5 text-[var(--muted)] hover:text-white rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {alertasFiltradas.length > 50 && (
              <p className="text-xs text-[var(--muted)] p-3 text-center">
                + {alertasFiltradas.length - 50} alertas más…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Atajos */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <p className="text-[10px] uppercase text-[var(--muted)] font-semibold mb-3">Atajos</p>
        <div className="flex gap-2 flex-wrap">
          <Link href="/closers" className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white rounded-lg">
            📊 KPIs detallados closers
          </Link>
          <Link href="/pipeline" className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white rounded-lg">
            📞 Pipeline general
          </Link>
          <Link href="/llamadas" className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white rounded-lg">
            📋 CRM de llamadas
          </Link>
          <Link href="/leaderboard" className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white rounded-lg">
            🥇 Leaderboard
          </Link>
          <Link href="/finanzas" className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white rounded-lg">
            💵 Finanzas
          </Link>
        </div>
      </div>
    </div>
  );
}
