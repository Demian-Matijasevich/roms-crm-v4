"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/Toast";
import type { AuthSession } from "@/lib/types";
import type { ForecastSnapshot } from "./page";

interface Props {
  snapshot: ForecastSnapshot;
  session: AuthSession;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

function scoreBadge(score: string) {
  if (score === "alto") return "bg-red-500/20 text-red-300 border-red-500/40";
  if (score === "medio") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (score === "bajo") return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  return "bg-green-500/15 text-green-300 border-green-500/30";
}

export default function ForecastClient({ snapshot, session }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editMeta, setEditMeta] = useState(false);
  const [metaCash, setMetaCash] = useState(String(snapshot.meta_cash_mensual_usd));
  const [metaVentas, setMetaVentas] = useState(String(snapshot.meta_ventas_mensual));
  const [saving, setSaving] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [snoozeDias, setSnoozeDias] = useState("7");
  const [snoozeMotivo, setSnoozeMotivo] = useState("");

  const { thisMonth, threeMonths, meta_cash_mensual_usd, meta_ventas_mensual, ventas_mes, aov_avg, cuotas_en_riesgo_detalle, por_closer, historico, gastos_mes, burn_rate_status, salud_financiera } = snapshot;

  const cashRestante = meta_cash_mensual_usd - thisMonth.proyectado_total;
  const pctMeta = meta_cash_mensual_usd > 0 ? (thisMonth.proyectado_total / meta_cash_mensual_usd) * 100 : 0;
  const ventasRestantes = meta_ventas_mensual - ventas_mes;
  const cashNecesarioParaMeta = Math.max(0, cashRestante);
  const ventasNecesariasAOV = aov_avg > 0 ? Math.ceil(cashNecesarioParaMeta / aov_avg) : 0;

  const maxBar = Math.max(...threeMonths.map((m) => m.total_nominal), meta_cash_mensual_usd, 1);

  async function saveMeta() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta_cash_mensual_usd: Number(metaCash) || 0,
          meta_ventas_mensual: Number(metaVentas) || 0,
        }),
      });
      if (res.ok) {
        toast.success("Meta actualizada");
        setEditMeta(false);
        router.refresh();
      } else {
        toast.error("No se pudo guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  async function doSnooze(paymentId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/cuotas/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: paymentId,
          dias: Number(snoozeDias) || 7,
          motivo: snoozeMotivo || undefined,
        }),
      });
      if (res.ok) {
        toast.success(`Cuota postergada ${snoozeDias} días`);
        setSnoozeFor(null);
        setSnoozeMotivo("");
        router.refresh();
      } else {
        toast.error("Error al postergar");
      }
    } finally {
      setSaving(false);
    }
  }

  function buildWA(c: typeof cuotas_en_riesgo_detalle[number]) {
    const venc = c.fecha_vencimiento ? new Date(c.fecha_vencimiento + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long" }) : "—";
    const txt = `Hola ${c.lead_nombre.split(" ")[0]}, te escribo desde ROMS. Te quería avisar que tenés una cuota de ${fmt(c.monto_usd)} con vencimiento ${venc}. ¿Cómo va con eso? Cualquier cosa me avisás. 🙌`;
    return txt;
  }

  function copyWA(c: typeof cuotas_en_riesgo_detalle[number]) {
    const txt = buildWA(c);
    navigator.clipboard.writeText(txt).then(
      () => toast.success("Mensaje copiado"),
      () => toast.error("No se pudo copiar")
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📈 Proyección y forecast</h1>
          <p className="text-sm text-[var(--muted)]">
            Periodo: {snapshot.fiscalStart} → {snapshot.fiscalEnd}
          </p>
        </div>
        {session.is_admin && !editMeta && (
          <button
            onClick={() => setEditMeta(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white"
          >
            ⚙ Editar meta
          </button>
        )}
      </div>

      {/* Editar meta */}
      {editMeta && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Editar meta del mes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Meta cash mensual (USD)</label>
              <input
                type="number"
                value={metaCash}
                onChange={(e) => setMetaCash(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Meta ventas mensual</label>
              <input
                type="number"
                value={metaVentas}
                onChange={(e) => setMetaVentas(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={saveMeta} disabled={saving} className="text-xs px-3 py-1.5 bg-[var(--purple)] text-white rounded">
              {saving ? "..." : "Guardar"}
            </button>
            <button onClick={() => setEditMeta(false)} className="text-xs px-3 py-1.5 bg-white/5 text-[var(--muted)] rounded">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* CARD: Proyección del mes */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">🎯 Proyección del mes</h2>
          <div className={`text-xs px-2 py-1 rounded ${pctMeta >= 90 ? "bg-green-500/20 text-green-300" : pctMeta >= 60 ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}`}>
            {Math.round(pctMeta)}% de la meta
          </div>
        </div>

        {/* Progress bar */}
        {meta_cash_mensual_usd > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
              <span>Meta: {fmt(meta_cash_mensual_usd)}</span>
              <span>Proyectado: {fmt(thisMonth.proyectado_total)}</span>
            </div>
            <div className="h-3 bg-[var(--background)] rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, pctMeta)}%`,
                  background:
                    pctMeta >= 90
                      ? "linear-gradient(90deg, #10b981, #34d399)"
                      : pctMeta >= 60
                      ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      : "linear-gradient(90deg, #ef4444, #f87171)",
                }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Mini label="Ya cobrado" value={fmt(thisMonth.ya_cobrado)} hint="Cash real entrado" />
          <Mini
            label="Pendiente nominal"
            value={fmt(thisMonth.pendiente_nominal)}
            hint={`${thisMonth.pendiente_nominal > 0 ? "Total si TODO se cobra" : "Sin cuotas pendientes"}`}
          />
          <Mini
            label="Pendiente esperado"
            value={fmt(thisMonth.pendiente_ponderado)}
            hint="Ponderado por probabilidad de cobro"
            accent="purple"
          />
          <Mini
            label="Proyectado total"
            value={fmt(thisMonth.proyectado_total)}
            hint="Ya cobrado + pendiente esperado"
            accent="green"
          />
        </div>

        {/* Brecha vs meta */}
        {meta_cash_mensual_usd > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--card-border)]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase text-[var(--muted)]">Falta para meta</p>
                <p className={`text-xl font-bold ${cashRestante <= 0 ? "text-green-300" : "text-amber-300"}`}>
                  {cashRestante <= 0 ? "✓ Meta superada" : fmt(cashRestante)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--muted)]">Ventas mes / meta</p>
                <p className="text-xl font-bold text-white">
                  {ventas_mes} / {meta_ventas_mensual}
                  {ventasRestantes > 0 && <span className="text-amber-300 text-xs ml-2">(faltan {ventasRestantes})</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-[var(--muted)]">Ventas que faltan (AOV)</p>
                <p className="text-xl font-bold text-white">
                  {ventasNecesariasAOV > 0 ? `${ventasNecesariasAOV} ventas` : "—"}
                  {aov_avg > 0 && <span className="text-xs text-[var(--muted)] ml-2">({fmt(aov_avg)} AOV)</span>}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CARD: Forecast 3 meses */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-4">📊 Forecast 3 meses (cuotas comprometidas)</h2>
        <div className="space-y-3">
          {threeMonths.map((m, i) => {
            const pctNom = (m.total_nominal / maxBar) * 100;
            const pctPond = (m.total_ponderado / maxBar) * 100;
            return (
              <div key={m.ym}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-white font-medium">
                    {m.label}
                    {i === 0 && <span className="text-[10px] text-[var(--muted)] ml-2">(este mes)</span>}
                  </span>
                  <span className="text-[var(--muted)] text-xs">
                    {m.count} cuotas · {fmt(m.total_ponderado)} esperado / {fmt(m.total_nominal)} nominal
                  </span>
                </div>
                <div className="relative h-6 bg-[var(--background)] rounded overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${pctNom}%` }} />
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${pctPond}%`,
                      background: "linear-gradient(90deg, var(--purple), var(--purple-light))",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-3">
          Barra clara = nominal (si TODO se cobra). Barra fuerte = esperado (ponderado por score de cobrabilidad).
        </p>
      </div>

      {/* CARD: Cuotas en riesgo */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)]">
          <h2 className="text-base font-semibold text-white">⚠️ Cuotas en riesgo ({cuotas_en_riesgo_detalle.length})</h2>
          <p className="text-xs text-[var(--muted)]">Ordenado por menor probabilidad de cobro.</p>
        </div>
        {cuotas_en_riesgo_detalle.length === 0 ? (
          <p className="text-sm text-[var(--muted)] p-6 text-center">Sin cuotas en riesgo 🎉</p>
        ) : (
          <div className="divide-y divide-[var(--card-border)]/40">
            {cuotas_en_riesgo_detalle.slice(0, 30).map((c) => (
              <div key={c.id} className="p-3 hover:bg-white/5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${scoreBadge(c.score)}`}>
                      {c.score} · {Math.round(c.proba_cobro * 100)}%
                    </span>
                    {c.lead_id ? (
                      <Link href={`/llamadas/${c.lead_id}/estado-cuenta`} className="text-white font-medium hover:text-[var(--purple-light)]">
                        {c.lead_nombre}
                      </Link>
                    ) : (
                      <span className="text-white font-medium">{c.lead_nombre}</span>
                    )}
                    <span className="text-white font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.monto_usd)}</span>
                    {c.dias_vencido > 0 && (
                      <span className="text-[11px] text-[var(--red)]">{c.dias_vencido}d vencida</span>
                    )}
                    {c.snooze_count > 0 && (
                      <span className="text-[11px] text-amber-300">postergada {c.snooze_count}x</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => copyWA(c)}
                      className="text-[11px] px-2 py-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300"
                      title="Copiar mensaje WA pre-armado"
                    >
                      📋 WA
                    </button>
                    <button
                      onClick={() => setSnoozeFor(snoozeFor === c.id ? null : c.id)}
                      className="text-[11px] px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300"
                    >
                      ⏰ Postergar
                    </button>
                  </div>
                </div>
                {c.motivos.length > 0 && (
                  <p className="text-[11px] text-[var(--muted)] mt-1">
                    {c.motivos.join(" · ")}
                  </p>
                )}
                {snoozeFor === c.id && (
                  <div className="mt-2 p-3 bg-white/5 border border-[var(--card-border)] rounded-lg flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-[var(--muted)]">+días</label>
                    <input
                      type="number"
                      value={snoozeDias}
                      onChange={(e) => setSnoozeDias(e.target.value)}
                      className="w-16 bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
                    />
                    <input
                      type="text"
                      value={snoozeMotivo}
                      onChange={(e) => setSnoozeMotivo(e.target.value)}
                      placeholder="Motivo (cliente pidió tiempo, banco, etc)"
                      className="flex-1 min-w-[200px] bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
                    />
                    <button
                      onClick={() => doSnooze(c.id)}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 bg-[var(--purple)] text-white rounded"
                    >
                      {saving ? "..." : "Postergar"}
                    </button>
                    <button onClick={() => setSnoozeFor(null)} className="text-xs px-2 py-1.5 text-[var(--muted)]">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {cuotas_en_riesgo_detalle.length > 30 && (
              <p className="text-xs text-[var(--muted)] p-3 text-center">+ {cuotas_en_riesgo_detalle.length - 30} más…</p>
            )}
          </div>
        )}
      </div>

      {/* CARD: Forecast por closer + E2 forecast 30d */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)]">
          <h2 className="text-base font-semibold text-white">👤 Forecast por closer</h2>
          <p className="text-xs text-[var(--muted)]">Cash mes + proyectado + cash y comisión esperada próximos 30d.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="px-4 py-2">Closer</th>
                <th className="px-3 py-2 text-right">Cash real</th>
                <th className="px-3 py-2 text-right">Proyectado mes</th>
                <th className="px-3 py-2 text-right">Cierres</th>
                <th className="px-3 py-2 text-right">AOV</th>
                <th className="px-3 py-2 text-right">Cash 30d est.</th>
                <th className="px-3 py-2 text-right">Comisión 30d</th>
              </tr>
            </thead>
            <tbody>
              {por_closer.map((c) => (
                <tr key={c.closer_id} className="border-b border-[var(--card-border)]/40 hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white font-medium">{c.closer_nombre}</td>
                  <td className="px-3 py-2.5 text-right text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.cash_mes_real)}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--purple-light)] font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.cash_mes_proyectado)}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--muted)]">{c.cierres_mes}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.aov > 0 ? fmt(c.aov) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-blue-300" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.cash_30d_estimado)}</td>
                  <td className="px-3 py-2.5 text-right text-green-300 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.com_30d_estimada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* E1: HISTÓRICO mes a mes */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)]">
          <h2 className="text-base font-semibold text-white">📊 Histórico últimos 6 meses</h2>
          <p className="text-xs text-[var(--muted)]">Cash real, % de cuotas cobradas vs vencidas, refunds. Para medir consistencia.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="px-4 py-2">Mes</th>
                <th className="px-3 py-2 text-right">Cash total</th>
                <th className="px-3 py-2 text-right">Cuotas vencidas</th>
                <th className="px-3 py-2 text-right">Cobradas</th>
                <th className="px-3 py-2 text-right">% cobro</th>
                <th className="px-3 py-2 text-right">Refunds</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.ym} className="border-b border-[var(--card-border)]/40 hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white font-medium">{h.label}</td>
                  <td className="px-3 py-2.5 text-right text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(h.cash_total)}</td>
                  <td className="px-3 py-2.5 text-right text-[var(--muted)]">{h.cuotas_vencieron}</td>
                  <td className="px-3 py-2.5 text-right text-green-300">{h.cuotas_cobradas}</td>
                  <td className={`px-3 py-2.5 text-right ${h.pct_cobro >= 80 ? "text-green-300" : h.pct_cobro >= 60 ? "text-amber-300" : "text-[var(--red)]"}`}>
                    {h.pct_cobro}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--red)]" style={{ fontVariantNumeric: "tabular-nums" }}>{h.refunds > 0 ? `−${fmt(h.refunds)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* E3 + E4: Burn rate + Score salud */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`bg-[var(--card-bg)] border rounded-xl p-5 ${
          burn_rate_status === "critical" ? "border-red-500/50" :
          burn_rate_status === "warning" ? "border-amber-500/50" : "border-green-500/30"
        }`}>
          <h3 className="text-sm font-semibold text-white mb-3">🔥 Burn rate del mes</h3>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(gastos_mes)}</p>
              <p className="text-[10px] text-[var(--muted)]">gastos del mes</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--muted)]">vs proyectado</p>
              <p className={`text-lg font-semibold ${
                burn_rate_status === "critical" ? "text-red-300" :
                burn_rate_status === "warning" ? "text-amber-300" : "text-green-300"
              }`}>
                {fmt(snapshot.cash_mes_proyectado)}
              </p>
            </div>
          </div>
          <p className={`text-xs mt-3 ${
            burn_rate_status === "critical" ? "text-red-300" :
            burn_rate_status === "warning" ? "text-amber-300" : "text-green-300"
          }`}>
            {burn_rate_status === "critical" && "🚨 Gastos exceden el cash proyectado. Riesgo de cash flow."}
            {burn_rate_status === "warning" && "⚠️ Gastos cerca del límite del cash. Atento."}
            {burn_rate_status === "ok" && "✅ Cash flow saludable."}
          </p>
        </div>

        <div className={`bg-[var(--card-bg)] border rounded-xl p-5 ${
          salud_financiera.level === "critico" ? "border-red-500/50" :
          salud_financiera.level === "alerta" ? "border-amber-500/50" :
          salud_financiera.level === "atencion" ? "border-yellow-500/30" : "border-green-500/30"
        }`}>
          <h3 className="text-sm font-semibold text-white mb-3">💎 Score salud financiera</h3>
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-bold ${
              salud_financiera.level === "critico" ? "text-red-300" :
              salud_financiera.level === "alerta" ? "text-amber-300" :
              salud_financiera.level === "atencion" ? "text-yellow-300" : "text-green-300"
            }`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {salud_financiera.score}
            </div>
            <div className="flex-1">
              <p className="text-sm text-white font-medium capitalize">{salud_financiera.level}</p>
              <p className="text-[10px] text-[var(--muted)]">
                Refunds: {salud_financiera.refunds_pct}% · Atrasadas: {salud_financiera.atrasadas_pct}% · Gastos: {salud_financiera.gastos_vs_ingresos_pct}%
              </p>
            </div>
          </div>
          {salud_financiera.motivos.length > 0 && (
            <ul className="mt-3 text-[10px] text-[var(--muted)] space-y-0.5">
              {salud_financiera.motivos.map((m, i) => <li key={i}>• {m}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "purple" | "green" }) {
  const color = accent === "purple" ? "text-[var(--purple-light)]" : accent === "green" ? "text-green-300" : "text-white";
  return (
    <div className="bg-[var(--background)]/40 border border-[var(--card-border)] rounded-lg p-3">
      <p className="text-[10px] uppercase text-[var(--muted)] font-semibold">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {hint && <p className="text-[10px] text-[var(--muted)] mt-0.5">{hint}</p>}
    </div>
  );
}
