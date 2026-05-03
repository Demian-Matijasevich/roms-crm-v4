"use client";

import { useState, useMemo } from "react";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD } from "@/lib/format";
import { getFiscalStart, getFiscalMonth, parseLocalDate } from "@/lib/date-utils";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
  payments: { id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }[];
  setters: { id: string; nombre: string }[];
  campaigns: { id: string; medium: string; source: string; content: string; setter_id: string | null }[];
}

interface SetterKpi {
  id: string;
  nombre: string;
  agendas: number;
  presentadas: number;
  cerradas: number;
  show_up_pct: number;
  cierre_pct: number;
  cash_cobrado: number;
  comision: number;
}

export default function SettersClient({ leads, payments, setters, campaigns }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(getFiscalStart().toISOString().split("T")[0]);
  const [showHelp, setShowHelp] = useState(false);

  const currentLabel = useMemo(() => getFiscalMonth(parseLocalDate(selectedMonth)), [selectedMonth]);

  const monthRange = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: toStr(start), end: toStr(end) };
  }, [selectedMonth]);

  // Build mapping utm_medium → setter_id
  const mediumToSetter = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of campaigns) {
      if (c.setter_id && c.medium) map.set(c.medium.toLowerCase(), c.setter_id);
    }
    return map;
  }, [campaigns]);

  // Source breakdown: count leads by utm_source in month
  const sourceBreakdown = useMemo(() => {
    const inMonth = leads.filter((l) => {
      const f = l.fecha_agendado?.split("T")[0] || l.fecha_llamada?.split("T")[0];
      return f && f >= monthRange.start && f <= monthRange.end;
    });
    const counts: Record<string, number> = {};
    for (const l of inMonth) {
      const src = (l.utm_source || "sin_utm").toLowerCase();
      counts[src] = (counts[src] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [leads, monthRange]);

  // Compute KPIs per setter
  const kpis: SetterKpi[] = useMemo(() => {
    const byId = new Map<string, SetterKpi>();
    for (const s of setters) {
      byId.set(s.id, { id: s.id, nombre: s.nombre, agendas: 0, presentadas: 0, cerradas: 0, show_up_pct: 0, cierre_pct: 0, cash_cobrado: 0, comision: 0 });
    }

    // Build a helper: resolve setter for a lead.
    // First check lead.setter_id; if missing but utm_medium maps to a campaign → use that.
    const leadSetterMap = new Map<string, string>();
    const monthLeads = leads.filter((l) => {
      const f = l.fecha_agendado?.split("T")[0] || l.fecha_llamada?.split("T")[0];
      return f && f >= monthRange.start && f <= monthRange.end;
    });
    for (const l of monthLeads) {
      let sid: string | null | undefined = l.setter_id;
      if (!sid && l.utm_medium) sid = mediumToSetter.get(l.utm_medium.toLowerCase()) ?? null;
      if (sid) leadSetterMap.set(l.id, sid);
    }

    // Agendas + Presentadas + Cerradas per setter
    for (const l of monthLeads) {
      const sid = leadSetterMap.get(l.id);
      if (!sid) continue;
      const k = byId.get(sid);
      if (!k) continue;
      // Agendas reales: excluyo cancelada y reprogramada
      if (l.estado !== "cancelada" && l.estado !== "reprogramada") {
        k.agendas++;
      }
      const presented = !["pendiente", "cancelada", "no_show", "reprogramada"].includes(l.estado);
      if (presented) k.presentadas++;
      if (l.estado === "cerrado" || l.estado === "adentro_seguimiento") k.cerradas++;
    }

    // Cash cobrado (3% commission) — payments in month whose lead has setter_id (by monthLeads mapping OR any lead)
    // For commission we consider ALL payments for setter's leads (not only month leads)
    const anyLeadSetter = new Map<string, string>();
    for (const l of leads) {
      let sid: string | null | undefined = l.setter_id;
      if (!sid && l.utm_medium) sid = mediumToSetter.get(l.utm_medium.toLowerCase()) ?? null;
      if (sid) anyLeadSetter.set(l.id, sid);
    }
    for (const p of payments) {
      if (!p.lead_id || !p.fecha_pago) continue;
      const f = p.fecha_pago.split("T")[0];
      if (f < monthRange.start || f > monthRange.end) continue;
      const sid = anyLeadSetter.get(p.lead_id);
      if (!sid) continue;
      const k = byId.get(sid);
      if (!k) continue;
      k.cash_cobrado += p.monto_usd;
      k.comision += p.monto_usd * 0.03;
    }

    // Percentages
    for (const k of byId.values()) {
      k.show_up_pct = k.agendas > 0 ? Math.round((k.presentadas / k.agendas) * 1000) / 10 : 0;
      k.cierre_pct = k.presentadas > 0 ? Math.round((k.cerradas / k.presentadas) * 1000) / 10 : 0;
    }

    return Array.from(byId.values()).sort((a, b) => b.agendas - a.agendas);
  }, [leads, payments, setters, mediumToSetter, monthRange]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Setters Analytics</h1>
          <p className="text-sm text-[var(--muted)]">Agendas por setter — {currentLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(!showHelp)} className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--muted)] hover:text-white">
            {showHelp ? "Ocultar" : "¿Cómo se calcula?"}
          </button>
          <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
        </div>
      </div>

      {showHelp && (
        <div className="bg-[var(--card-bg)] border border-[var(--purple)]/40 rounded-xl p-6 space-y-3 text-sm">
          <h3 className="text-base font-semibold text-white mb-2">📖 Explicación</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[var(--muted)]">
            <div>
              <p className="text-white font-medium">Agendas</p>
              <p>Leads cuyo <code>setter_id</code> es este setter (asignado directo), O cuyo <code>utm_medium</code> matchea una UTM campaign de este setter (ej: utm_medium=IGNA → Igna).</p>
            </div>
            <div>
              <p className="text-white font-medium">Presentadas / Cerradas / %</p>
              <p>Mismo criterio que en Closers: presentadas = estado ≠ pendiente/cancelada/no_show/reprogramada. Cerradas = cerrado o adentro_seguimiento.</p>
            </div>
            <div>
              <p className="text-white font-medium">Cash cobrado</p>
              <p>Suma de pagos pagados con fecha_pago en el mes para leads de este setter.</p>
            </div>
            <div>
              <p className="text-white font-medium">Comisión setter</p>
              <p><b>3% del cash cobrado</b> en el mes.</p>
            </div>
          </div>
        </div>
      )}

      {/* Fuente breakdown */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Agendas por fuente (UTM Source) — {currentLabel}</h2>
        {sourceBreakdown.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">Sin datos para este mes</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sourceBreakdown.map(([src, count]) => (
              <div key={src} className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
                <p className="text-xs text-[var(--muted)] uppercase">{src}</p>
                <p className="text-xl font-bold text-white">{count}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--muted)] mt-3">
          Las agendas de <code>landing</code> generalmente vienen de página directa sin setter asignado. Si un setter tiene un link propio con <code>utm_source=landing</code>, configuralo en <a href="/utm" className="text-[var(--purple-light)] underline">UTM Builder</a> con él como setter.
        </p>
      </div>

      {/* Per-Setter cards */}
      {kpis.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
          No hay setters activos
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {kpis.map((k) => (
            <div key={k.id} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-3">{k.nombre}</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-[var(--muted)]">Agendas</p>
                  <p className="text-lg font-bold text-white">{k.agendas}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Presentadas</p>
                  <p className="text-lg font-bold text-white">{k.presentadas}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Cerradas</p>
                  <p className="text-lg font-bold text-[var(--green)]">{k.cerradas}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[var(--card-border)]">
                <div>
                  <p className="text-xs text-[var(--muted)]">Show Up %</p>
                  <p className="text-sm font-bold text-white">{k.show_up_pct}%</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Cierre %</p>
                  <p className="text-sm font-bold text-white">{k.cierre_pct}%</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[var(--card-border)]">
                <div>
                  <p className="text-xs text-[var(--muted)]">Cash cobrado (mes)</p>
                  <p className="text-sm font-bold text-[var(--green)]">{formatUSD(k.cash_cobrado)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Comisión (3%)</p>
                  <p className="text-sm font-bold text-[var(--purple-light)]">{formatUSD(Math.round(k.comision))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
