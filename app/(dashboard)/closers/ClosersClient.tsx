"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD } from "@/lib/format";
import { getFiscalStart, getFiscalMonth, getFiscalMonthOptions, parseLocalDate } from "@/lib/date-utils";
import { computeValenCommission } from "@/lib/commissions";
import type { CloserKPI, Lead } from "@/lib/types";

interface Commission {
  team_member_id: string;
  nombre: string;
  mes_fiscal: string;
  comision_closer: number | null;
  comision_setter: number | null;
  comision_total: number | null;
}

interface Props {
  closerKpis: CloserKPI[];
  leads: Lead[];
  commissions: Commission[];
  payments: { id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }[];
  team: { id: string; nombre: string; is_closer: boolean }[];
}

interface ComputedKpi {
  team_member_id: string;
  nombre: string;
  total_agendas: number;
  presentadas: number;
  calificadas: number;
  cerradas: number;
  show_up_pct: number;
  cierre_pct: number;
  aov: number;
  comision_closer: number;
  cash_cobrado: number;
  leads_con_cobro: number;
}

export default function ClosersClient({
  closerKpis,
  leads,
  commissions,
  payments,
  team,
}: Props) {
  void commissions;
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );
  const [showHelp, setShowHelp] = useState(false);

  const currentLabel = useMemo(
    () => getFiscalMonth(parseLocalDate(selectedMonth)),
    [selectedMonth]
  );

  // Fiscal month range (ROMS = calendar month)
  const monthRange = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: toStr(start), end: toStr(end) };
  }, [selectedMonth]);

  // Compute KPIs client-side from raw leads + payments (audit-friendly)
  const currentKpis: ComputedKpi[] = useMemo(() => {
    const byCloser: Record<string, ComputedKpi> = {};
    // Init for every closer (even those with 0 leads this month)
    for (const t of team) {
      byCloser[t.id] = {
        team_member_id: t.id,
        nombre: t.nombre,
        total_agendas: 0,
        presentadas: 0,
        calificadas: 0,
        cerradas: 0,
        show_up_pct: 0,
        cierre_pct: 0,
        aov: 0,
        comision_closer: 0,
        cash_cobrado: 0,
        leads_con_cobro: 0,
      };
    }

    // Leads this month by closer (using fecha_llamada)
    const leadsThisMonth = leads.filter((l) => {
      if (!l.fecha_llamada || !l.closer_id) return false;
      const f = l.fecha_llamada.split("T")[0];
      return f >= monthRange.start && f <= monthRange.end;
    });

    for (const l of leadsThisMonth) {
      const k = byCloser[l.closer_id!];
      if (!k) continue;
      k.total_agendas++;
      const presentada = !["pendiente", "cancelada", "no_show", "reprogramada"].includes(l.estado);
      if (presentada) {
        k.presentadas++;
        if (l.lead_calificado === "calificado") k.calificadas++;
      }
      if (["cerrado", "adentro_seguimiento"].includes(l.estado)) {
        k.cerradas++;
      }
    }

    // Compute percentages + AOV (from tickets of cerradas)
    for (const l of leadsThisMonth) {
      const k = byCloser[l.closer_id!];
      if (!k) continue;
      if (["cerrado", "adentro_seguimiento"].includes(l.estado) && l.ticket_total) {
        k.aov += l.ticket_total;
      }
    }
    for (const k of Object.values(byCloser)) {
      k.show_up_pct = k.total_agendas > 0 ? Math.round((k.presentadas / k.total_agendas) * 1000) / 10 : 0;
      k.cierre_pct = k.presentadas > 0 ? Math.round((k.cerradas / k.presentadas) * 1000) / 10 : 0;
      k.aov = k.cerradas > 0 ? Math.round(k.aov / k.cerradas) : 0;
    }

    // Build lead maps
    const leadCloserMap: Record<string, string> = {};
    const leadProgramaMap: Record<string, string | null> = {};
    for (const l of leads) {
      if (l.closer_id) leadCloserMap[l.id] = l.closer_id;
      leadProgramaMap[l.id] = (l.programa_pitcheado as string | null) || null;
    }

    // Collect payments per closer (for cash + commission calc)
    const paymentsPerCloser: Record<string, { monto_usd: number; programa: string | null }[]> = {};
    const leadsConCobroSet: Record<string, Set<string>> = {};

    for (const p of payments) {
      if (!p.lead_id || !p.fecha_pago) continue;
      const f = p.fecha_pago.split("T")[0];
      if (f < monthRange.start || f > monthRange.end) continue;
      const closerId = leadCloserMap[p.lead_id];
      if (!closerId || !byCloser[closerId]) continue;
      byCloser[closerId].cash_cobrado += p.monto_usd;
      (leadsConCobroSet[closerId] ||= new Set()).add(p.lead_id);
      (paymentsPerCloser[closerId] ||= []).push({ monto_usd: p.monto_usd, programa: leadProgramaMap[p.lead_id] || null });
    }

    // Compute commissions per closer using new scheme
    for (const k of Object.values(byCloser)) {
      const payList = paymentsPerCloser[k.team_member_id] || [];
      const monthlyCash = k.cash_cobrado;
      const result = computeValenCommission(payList, monthlyCash);
      k.comision_closer = result.total;
    }

    for (const [cid, set] of Object.entries(leadsConCobroSet)) {
      if (byCloser[cid]) byCloser[cid].leads_con_cobro = set.size;
    }

    return Object.values(byCloser).sort((a, b) => b.cash_cobrado - a.cash_cobrado);
  }, [leads, payments, team, monthRange]);

  // Funnel data per closer (filter out closers with 0 agendas)
  const funnelData = useMemo(() => {
    return currentKpis
      .filter((k) => k.total_agendas > 0)
      .map((k) => ({
        nombre: k.nombre,
        Agendas: k.total_agendas,
        "Show Up": k.presentadas,
        Calificadas: k.calificadas,
        Cerrado: k.cerradas,
      }));
  }, [currentKpis]);

  // Trend data — cierre% over last 6 fiscal months per closer
  const trendData = useMemo(() => {
    const months = getFiscalMonthOptions(6).reverse();
    const closerNames = [...new Set(closerKpis.map((k) => k.nombre))];

    return months.map((m) => {
      const entry: Record<string, string | number> = { mes: m.label };
      for (const name of closerNames) {
        const kpi = closerKpis.find(
          (k) => k.nombre === name && k.mes_fiscal === m.label
        );
        entry[name] = kpi?.cierre_pct ?? 0;
      }
      return entry;
    });
  }, [closerKpis]);

  const closerNames = useMemo(
    () => [...new Set(closerKpis.map((k) => k.nombre))],
    [closerKpis]
  );

  const closerColors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  // Commission table rows for current month (from computed KPIs)
  const commissionRows = useMemo(() => {
    return currentKpis
      .filter((k) => k.comision_closer > 0)
      .map((k) => ({
        nombre: k.nombre,
        comision_closer: Math.round(k.comision_closer),
        mes_fiscal: currentLabel,
      }))
      .sort((a, b) => b.comision_closer - a.comision_closer);
  }, [currentKpis, currentLabel]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Closers Analytics</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Metricas de rendimiento &mdash; {currentLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--muted)] hover:text-white transition-colors"
          >
            {showHelp ? "Ocultar" : "¿Cómo se calcula?"}
          </button>
          <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
        </div>
      </div>

      {/* Help panel — metric explanations */}
      {showHelp && (
        <div className="bg-[var(--card-bg)] border border-[var(--purple)]/40 rounded-xl p-6 space-y-3 text-sm">
          <h3 className="text-base font-semibold text-white mb-2">📖 Explicación de métricas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[var(--muted)]">
            <div>
              <p className="text-white font-medium">Agendas</p>
              <p>Total de leads con <code>fecha_llamada</code> en el mes seleccionado y <code>closer_id</code> = este closer. Cuenta todos los estados (pendientes, presentados, cerrados, etc).</p>
            </div>
            <div>
              <p className="text-white font-medium">Presentadas</p>
              <p>Leads del closer que efectivamente tuvieron la llamada. Estado ≠ <code>pendiente</code>, <code>cancelada</code>, <code>no_show</code>, <code>reprogramada</code>.</p>
            </div>
            <div>
              <p className="text-white font-medium">Calificadas</p>
              <p>De las <b>presentadas</b>, cuántas tienen <code>lead_calificado = calificado</code>. Siempre ≤ Presentadas.</p>
            </div>
            <div>
              <p className="text-white font-medium">Cerradas</p>
              <p>Leads con estado <code>cerrado</code> o <code>adentro_seguimiento</code> (venta confirmada).</p>
            </div>
            <div>
              <p className="text-white font-medium">Show Up %</p>
              <p><code>Presentadas / Agendas × 100</code>. Qué % de agendados llegaron a la llamada.</p>
            </div>
            <div>
              <p className="text-white font-medium">Cierre %</p>
              <p><code>Cerradas / Presentadas × 100</code>. Qué % de los que se presentaron compraron.</p>
            </div>
            <div>
              <p className="text-white font-medium">AOV (Average Order Value)</p>
              <p>Ticket promedio de las ventas cerradas. Suma de <code>ticket_total</code> de todas las cerradas dividido por la cantidad. Ej: 3 cerradas de $10k = AOV $10k.</p>
            </div>
            <div>
              <p className="text-white font-medium">Leads con cobro</p>
              <p>Cantidad de <b>leads distintos</b> que tuvieron al menos 1 pago en el mes. Incluye leads cerrados en meses anteriores cuyas cuotas se cobraron ahora.</p>
            </div>
            <div>
              <p className="text-white font-medium">Cash cobrado</p>
              <p>Suma de todos los <code>payments.monto_usd</code> con estado <code>pagado</code> y <code>fecha_pago</code> en el mes, donde el lead tiene este closer asignado.</p>
            </div>
            <div>
              <p className="text-white font-medium">Comisión closer</p>
              <p>
                Base por servicio × multiplicador de volumen mensual (cap 10%):<br/>
                • <b>Omnipresencia</b>: 7% · <b>Multicuentas</b>: 5% · <b>Consultoría</b>: 7%<br/>
                • Multiplicador por cash cobrado del mes:<br/>
                &nbsp;&nbsp;- ≤ $70k → 1.00x (Omni 7% / Multi 5%)<br/>
                &nbsp;&nbsp;- $70k – $100k → 1.15x (Omni 8.05% / Multi 5.75%)<br/>
                &nbsp;&nbsp;- &gt; $100k → 1.30x (Omni 9.10% / Multi 6.50%)<br/>
                Se calcula sobre cada pago según el programa del lead (no sobre el monto agregado).
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--card-border)]">
            ⚠️ Las métricas se calculan en tiempo real desde <code>leads</code> y <code>payments</code>. Si un número no coincide con lo esperado: verificá que el lead tenga <code>closer_id</code>, <code>fecha_llamada</code> en el mes correcto, y estado consistente.
          </p>
        </div>
      )}

      {/* Per-Closer KPI Cards */}
      {currentKpis.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">Sin datos para este periodo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {currentKpis.map((k) => (
            <div
              key={k.team_member_id}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-3">
                {k.nombre}
              </h3>
              <div className="grid grid-cols-4 gap-3">
                <div title="Todos los leads asignados al closer con fecha_llamada en el mes">
                  <p className="text-xs text-[var(--muted)]">Agendas</p>
                  <p className="text-lg font-bold text-white">{k.total_agendas}</p>
                </div>
                <div title="Leads que tuvieron la llamada efectivamente (excluye pendientes/cancelados/no-show/reprogramados)">
                  <p className="text-xs text-[var(--muted)]">Presentadas</p>
                  <p className="text-lg font-bold text-white">{k.presentadas}</p>
                </div>
                <div title="De los presentados, cuántos quedaron calificados">
                  <p className="text-xs text-[var(--muted)]">Calificadas</p>
                  <p className="text-lg font-bold text-white">{k.calificadas}</p>
                </div>
                <div title="Leads con estado cerrado o adentro_seguimiento">
                  <p className="text-xs text-[var(--muted)]">Cerradas</p>
                  <p className="text-lg font-bold text-[var(--green)]">{k.cerradas}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--card-border)]">
                <div title="Presentadas / Agendas × 100">
                  <p className="text-xs text-[var(--muted)]">Show Up %</p>
                  <p className="text-sm font-bold text-white">{k.show_up_pct}%</p>
                </div>
                <div title="Cerradas / Presentadas × 100">
                  <p className="text-xs text-[var(--muted)]">Cierre %</p>
                  <p className="text-sm font-bold text-white">{k.cierre_pct}%</p>
                </div>
                <div title="Ticket promedio de las ventas cerradas (suma de ticket_total / cerradas)">
                  <p className="text-xs text-[var(--muted)]">AOV</p>
                  <p className="text-sm font-bold text-white">{formatUSD(k.aov)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--card-border)]">
                <div title="Cantidad de leads distintos que tuvieron algún pago en el mes (incluye cuotas de meses anteriores)">
                  <p className="text-xs text-[var(--muted)]">Leads con cobro</p>
                  <p className="text-sm font-bold text-white">{k.leads_con_cobro}</p>
                </div>
                <div title="Suma de pagos pagados con fecha_pago en el mes, para leads de este closer">
                  <p className="text-xs text-[var(--muted)]">Cash cobrado</p>
                  <p className="text-sm font-bold text-[var(--green)]">{formatUSD(k.cash_cobrado)}</p>
                </div>
                <div title="Comisión por servicio × multiplicador de volumen (ver '¿Cómo se calcula?')">
                  <p className="text-xs text-[var(--muted)]">Comisión</p>
                  <p className="text-sm font-bold text-[var(--purple-light)]">{formatUSD(Math.round(k.comision_closer))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Funnel Chart */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Embudo de Conversion por Closer
        </h2>
        {funnelData.length === 0 ? (
          <p className="text-[var(--muted)] text-sm text-center py-8">
            Sin datos
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--card-border)"
              />
              <XAxis type="number" stroke="var(--muted)" fontSize={11} />
              <YAxis
                type="category"
                dataKey="nombre"
                stroke="var(--muted)"
                fontSize={11}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "8px",
                  color: "white",
                }}
              />
              <Legend />
              <Bar dataKey="Agendas" fill="#8b5cf6" />
              <Bar dataKey="Show Up" fill="#a78bfa" />
              <Bar dataKey="Calificadas" fill="#f59e0b" />
              <Bar dataKey="Cerrado" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Trends — cierre% over 6 months */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Tendencia Cierre % (ultimos 6 meses)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
            <XAxis
              dataKey="mes"
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "white",
              }}
              formatter={(value) => [
                `${value}%`,
                "",
              ]}
            />
            <Legend />
            {closerNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={closerColors[i % closerColors.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Commissions Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Comisiones &mdash; {currentLabel}
        </h2>
        {commissionRows.length === 0 ? (
          <p className="text-[var(--muted)] text-sm text-center py-4">
            Sin comisiones registradas
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase">
                  <th className="text-left py-2 px-3">Closer</th>
                  <th className="text-right py-2 px-3">Comision</th>
                  <th className="text-left py-2 px-3">Periodo</th>
                </tr>
              </thead>
              <tbody>
                {commissionRows.map((c) => (
                  <tr
                    key={c.nombre}
                    className="border-t border-[var(--card-border)]"
                  >
                    <td className="py-2 px-3 text-white font-medium">
                      {c.nombre}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-[var(--green)]">
                      {formatUSD(c.comision_closer)}
                    </td>
                    <td className="py-2 px-3 text-[var(--muted)]">
                      {c.mes_fiscal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
