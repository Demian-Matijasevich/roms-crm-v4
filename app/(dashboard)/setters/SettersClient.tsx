"use client";

import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
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
  outbound: number;
  inbound: number;
  presentadas: number;
  cerradas: number;
  show_up_pct: number;
  cierre_pct: number;
  cash_cobrado: number;
  comision: number;
}

export default function SettersClient({ leads, payments, setters, campaigns }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(getFiscalStart().toISOString().split("T")[0]);
  const [selectedDay, setSelectedDay] = useState<string>(""); // si hay valor → override, filtra solo ese día
  const [showHelp, setShowHelp] = useState(false);

  const currentLabel = useMemo(() => {
    if (selectedDay) return selectedDay;
    return getFiscalMonth(parseLocalDate(selectedMonth));
  }, [selectedMonth, selectedDay]);

  const monthRange = useMemo(() => {
    if (selectedDay) {
      // Si hay día seleccionado, el rango es solo ese día
      return { start: selectedDay, end: selectedDay };
    }
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: toStr(start), end: toStr(end) };
  }, [selectedMonth, selectedDay]);

  // Build mapping utm_medium → setter_id
  const mediumToSetter = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of campaigns) {
      if (c.setter_id && c.medium) map.set(c.medium.toLowerCase(), c.setter_id);
    }
    return map;
  }, [campaigns]);

  // Source breakdown: leads del mes clasificados por origen real (outbound / inbound:source / landing)
  const sourceBreakdown = useMemo(() => {
    const inMonth = leads.filter((l) => {
      if (l.estado === "cancelada" || l.estado === "reprogramada") return false;
      const f = l.fecha_agendado?.split("T")[0] || l.fecha_llamada?.split("T")[0];
      return f && f >= monthRange.start && f <= monthRange.end;
    });
    let outbound = 0;
    const inboundBySource: Record<string, number> = {};
    const landingBySource: Record<string, number> = {};
    for (const l of inMonth) {
      if (l.utm_medium) {
        const src = (l.utm_source || "sin_source").toLowerCase().trim();
        inboundBySource[src] = (inboundBySource[src] || 0) + 1;
        continue;
      }
      if (l.setter_id) {
        outbound++;
        continue;
      }
      // landing: sin setter, sin utm_medium — pero podemos usar utm_source para saber de dónde vino
      const src = (l.utm_source || "sin_source").toLowerCase().trim();
      landingBySource[src] = (landingBySource[src] || 0) + 1;
    }
    const totalLanding = Object.values(landingBySource).reduce((s, n) => s + n, 0);
    return {
      outbound,
      landing: totalLanding,
      landingBySource: Object.entries(landingBySource).sort((a, b) => b[1] - a[1]),
      inboundBySource: Object.entries(inboundBySource).sort((a, b) => b[1] - a[1]),
      totalInbound: Object.values(inboundBySource).reduce((s, n) => s + n, 0),
      total: inMonth.length,
    };
  }, [leads, monthRange]);

  // Helper: resolve setter for a lead and whether it's outbound (direct setter_id) or inbound (via utm_medium)
  // Prioridad: si tiene utm_medium que mapea a un setter → INBOUND (vino por campaña).
  // Sino, si tiene setter_id → OUTBOUND (setter lo cargó/prospectó manual).
  const resolveSetter = useMemo(() => {
    return (l: Lead): { sid: string | null; via: "direct" | "utm" | null } => {
      if (l.utm_medium) {
        const sid = mediumToSetter.get(l.utm_medium.toLowerCase().trim());
        if (sid) return { sid, via: "utm" };
      }
      if (l.setter_id) return { sid: l.setter_id, via: "direct" };
      return { sid: null, via: null };
    };
  }, [mediumToSetter]);

  // Compute KPIs per setter
  const kpis: SetterKpi[] = useMemo(() => {
    const byId = new Map<string, SetterKpi>();
    for (const s of setters) {
      byId.set(s.id, { id: s.id, nombre: s.nombre, agendas: 0, outbound: 0, inbound: 0, presentadas: 0, cerradas: 0, show_up_pct: 0, cierre_pct: 0, cash_cobrado: 0, comision: 0 });
    }

    // Build a helper: resolve setter for a lead.
    const leadSetterMap = new Map<string, { sid: string; via: "direct" | "utm" }>();
    const monthLeads = leads.filter((l) => {
      const f = l.fecha_agendado?.split("T")[0] || l.fecha_llamada?.split("T")[0];
      return f && f >= monthRange.start && f <= monthRange.end;
    });
    for (const l of monthLeads) {
      const { sid, via } = resolveSetter(l);
      if (sid && via) leadSetterMap.set(l.id, { sid, via });
    }

    // Agendas + Presentadas + Cerradas per setter (con desglose outbound/inbound)
    for (const l of monthLeads) {
      const entry = leadSetterMap.get(l.id);
      if (!entry) continue;
      const k = byId.get(entry.sid);
      if (!k) continue;
      // Agendas reales: excluyo cancelada y reprogramada
      if (l.estado !== "cancelada" && l.estado !== "reprogramada") {
        k.agendas++;
        if (entry.via === "direct") k.outbound++;
        else k.inbound++;
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
  }, [leads, payments, setters, monthRange, resolveSetter]);

  // ─── Daily breakdown per setter (con outbound/inbound stacked) ───
  const [dailySetterFilter, setDailySetterFilter] = useState<string>("todos");
  const [chartMode, setChartMode] = useState<"out_in" | "by_setter">("by_setter");

  // Color palette por setter (estable por id)
  const setterColors = useMemo(() => {
    const palette = ["#fb923c", "#60a5fa", "#34d399", "#a78bfa", "#f472b6", "#facc15", "#22d3ee", "#fb7185", "#84cc16", "#c084fc"];
    const sortedSetters = [...setters].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const map = new Map<string, string>();
    sortedSetters.forEach((s, i) => map.set(s.id, palette[i % palette.length]));
    return map;
  }, [setters]);

  const dailyChartData = useMemo(() => {
    // Build day buckets: each day in monthRange
    const start = parseLocalDate(monthRange.start);
    const end = parseLocalDate(monthRange.end);
    const isAll = dailySetterFilter === "todos";

    // Cuando "todos" + modo by_setter → claves dinámicas <setter>_out / <setter>_in
    // Cuando un setter específico → claves fijas outbound / inbound
    const days: Map<string, Record<string, number | string>> = new Map();
    const cur = new Date(start);
    while (cur <= end) {
      const k = cur.toISOString().slice(0, 10);
      const bucket: Record<string, number | string> = { day: k.slice(5), total: 0 };
      if (!isAll || chartMode === "out_in") {
        bucket.outbound = 0;
        bucket.inbound = 0;
      } else {
        for (const s of setters) {
          bucket[`${s.id}_out`] = 0;
          bucket[`${s.id}_in`] = 0;
        }
      }
      days.set(k, bucket);
      cur.setDate(cur.getDate() + 1);
    }
    for (const l of leads) {
      const f = l.fecha_agendado?.split("T")[0] || l.fecha_llamada?.split("T")[0];
      if (!f || f < monthRange.start || f > monthRange.end) continue;
      if (l.estado === "cancelada" || l.estado === "reprogramada") continue;
      const { sid, via } = resolveSetter(l);
      if (!sid) continue;
      if (!isAll && sid !== dailySetterFilter) continue;
      const bucket = days.get(f);
      if (!bucket) continue;
      bucket.total = (bucket.total as number) + 1;
      if (!isAll || chartMode === "out_in") {
        if (via === "direct") bucket.outbound = (bucket.outbound as number) + 1;
        else bucket.inbound = (bucket.inbound as number) + 1;
      } else {
        const key = via === "direct" ? `${sid}_out` : `${sid}_in`;
        bucket[key] = (bucket[key] as number || 0) + 1;
      }
    }
    return Array.from(days.values());
  }, [leads, monthRange, resolveSetter, dailySetterFilter, chartMode, setters]);

  // Series para el chart (depende del modo)
  const chartSeries = useMemo(() => {
    const isAll = dailySetterFilter === "todos";
    if (!isAll || chartMode === "out_in") {
      return [
        { dataKey: "outbound", fill: "#fb923c", name: "Outbound" },
        { dataKey: "inbound", fill: "#60a5fa", name: "Inbound" },
      ];
    }
    // Modo por setter: 2 series por setter (out + in con misma base color)
    const series: { dataKey: string; fill: string; name: string }[] = [];
    const sortedSetters = [...setters].sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const s of sortedSetters) {
      const baseColor = setterColors.get(s.id) || "#888";
      series.push({ dataKey: `${s.id}_out`, fill: baseColor, name: `${s.nombre} · out` });
      series.push({ dataKey: `${s.id}_in`, fill: baseColor + "99", name: `${s.nombre} · in` });
    }
    return series;
  }, [setters, dailySetterFilter, chartMode, setterColors]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Setters Analytics</h1>
          <p className="text-sm text-[var(--muted)]">
            Agendas por setter — {currentLabel}
            {selectedDay && <span className="ml-2 text-[var(--purple-light)]">(día específico)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowHelp(!showHelp)} className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--muted)] hover:text-white">
            {showHelp ? "Ocultar" : "¿Cómo se calcula?"}
          </button>
          <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white"
            title="Seleccionar día específico" />
          {selectedDay && (
            <button onClick={() => setSelectedDay("")}
              className="text-xs text-[var(--muted)] hover:text-white border border-[var(--card-border)] px-3 py-2 rounded-lg">
              ✕ Volver al mes
            </button>
          )}
          <button onClick={() => setSelectedDay(new Date().toISOString().slice(0, 10))}
            className="text-xs bg-[var(--purple)]/20 hover:bg-[var(--purple)]/40 text-[var(--purple-light)] px-3 py-2 rounded-lg">
            Hoy
          </button>
          <MonthSelector77 value={selectedMonth} onChange={(v) => { setSelectedMonth(v); setSelectedDay(""); }} />
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

      {/* Daily chart - agendas by day with outbound/inbound stacked */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">📅 Agendas por día — {currentLabel}</h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              {dailySetterFilter === "todos" && chartMode === "by_setter"
                ? "Color sólido = outbound · color claro = inbound · cada color es un setter distinto"
                : <><span className="text-orange-400">●</span> Outbound (setter manual) · <span className="text-blue-400">●</span> Inbound (vino por UTM)</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dailySetterFilter === "todos" && (
              <select value={chartMode} onChange={(e) => setChartMode(e.target.value as "out_in" | "by_setter")}
                className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-sm text-white">
                <option value="by_setter">Vista: por setter</option>
                <option value="out_in">Vista: out vs in</option>
              </select>
            )}
            <select value={dailySetterFilter} onChange={(e) => setDailySetterFilter(e.target.value)}
              className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-sm text-white">
              <option value="todos">Todos los setters</option>
              {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={dailyChartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="day" stroke="#888" fontSize={11} />
            <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {chartSeries.map((s) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} stackId="a" fill={s.fill} name={s.name} />
            ))}
            {/* Bar invisible solo para el label del total arriba del stack */}
            <Bar dataKey="total" stackId="b" fill="transparent" isAnimationActive={false} legendType="none">
              <LabelList
                dataKey="total"
                position="top"
                content={(props) => {
                  const { x, y, width, value } = props as { x?: number; y?: number; width?: number; value?: number | string };
                  const v = typeof value === "number" ? value : Number(value || 0);
                  if (!v || x == null || y == null || width == null) return null;
                  const cx = x + width / 2;
                  const labelW = v >= 100 ? 28 : v >= 10 ? 22 : 18;
                  return (
                    <g>
                      <rect x={cx - labelW / 2} y={y - 18} width={labelW} height={15} rx={7} fill="#1f1f24" stroke="#444" strokeWidth={1} />
                      <text x={cx} y={y - 7} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700}>{v}</text>
                    </g>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Fuente breakdown */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Agendas por origen — {currentLabel}</h2>
        {sourceBreakdown.total === 0 ? (
          <p className="text-[var(--muted)] text-sm">Sin datos para este mes</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[var(--background)] border border-orange-400/40 rounded-lg p-3">
                <p className="text-xs text-orange-400 uppercase">🟧 Outbound</p>
                <p className="text-2xl font-bold text-white">{sourceBreakdown.outbound}</p>
                <p className="text-[10px] text-[var(--muted)]">setter prospectó manual</p>
              </div>
              <div className="bg-[var(--background)] border border-blue-400/40 rounded-lg p-3">
                <p className="text-xs text-blue-400 uppercase">🟦 Inbound</p>
                <p className="text-2xl font-bold text-white">{sourceBreakdown.totalInbound}</p>
                <p className="text-[10px] text-[var(--muted)]">vino por UTM medium</p>
              </div>
              <div className="bg-[var(--background)] border border-[var(--purple)]/40 rounded-lg p-3">
                <p className="text-xs text-[var(--purple-light)] uppercase">🟪 Landing</p>
                <p className="text-2xl font-bold text-white">{sourceBreakdown.landing}</p>
                <p className="text-[10px] text-[var(--muted)]">sin UTM ni setter</p>
              </div>
            </div>
            {sourceBreakdown.inboundBySource.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-blue-400 uppercase tracking-wide mb-2">🟦 Inbound desglose por UTM source</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {sourceBreakdown.inboundBySource.map(([src, count]) => (
                    <div key={src} className="bg-[var(--background)] border border-blue-400/30 rounded-lg p-2.5">
                      <p className="text-[10px] text-[var(--muted)] uppercase truncate">{src}</p>
                      <p className="text-base font-bold text-blue-400">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sourceBreakdown.landingBySource.length > 0 && (
              <div>
                <p className="text-xs text-[var(--purple-light)] uppercase tracking-wide mb-2">🟪 Landing desglose por UTM source</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {sourceBreakdown.landingBySource.map(([src, count]) => (
                    <div key={src} className="bg-[var(--background)] border border-[var(--purple)]/30 rounded-lg p-2.5">
                      <p className="text-[10px] text-[var(--muted)] uppercase truncate">{src}</p>
                      <p className="text-base font-bold text-[var(--purple-light)]">{count}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-2">
                  Estos son los leads sin setter ni UTM medium — si les pegás distinto <code>utm_source</code> en cada lugar (IG bio, web, ads...) vas a ver de dónde vienen acá.
                </p>
              </div>
            )}
          </>
        )}
        <p className="text-xs text-[var(--muted)] mt-3">
          Si un lead vino por landing pero querés atribuirlo a un setter, configuralo en <a href="/utm" className="text-[var(--purple-light)] underline">UTM Builder</a>.
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
                  <p className="text-[10px] text-[var(--muted)]">
                    <span className="text-orange-400">{k.outbound} out</span> · <span className="text-blue-400">{k.inbound} in</span>
                  </p>
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
                <div title="Presentadas / Agendas × 100. Muestras chicas (<5) aparecen atenuadas — el % no es confiable.">
                  <p className="text-xs text-[var(--muted)]">Show Up %</p>
                  <p className={`text-sm font-bold ${k.agendas < 5 ? "text-[var(--muted)]" : "text-white"}`}>
                    {k.show_up_pct}%
                    {k.agendas > 0 && (
                      <span className="text-[10px] text-[var(--muted)] ml-1 font-normal">
                        ({k.presentadas}/{k.agendas})
                      </span>
                    )}
                  </p>
                </div>
                <div title="Cerradas / Presentadas × 100. Muestras chicas (<5) aparecen atenuadas — el % no es confiable.">
                  <p className="text-xs text-[var(--muted)]">Cierre %</p>
                  <p className={`text-sm font-bold ${k.presentadas < 5 ? "text-[var(--muted)]" : "text-white"}`}>
                    {k.cierre_pct}%
                    {k.presentadas > 0 && (
                      <span className="text-[10px] text-[var(--muted)] ml-1 font-normal">
                        ({k.cerradas}/{k.presentadas})
                      </span>
                    )}
                  </p>
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
