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
}

export default function ClosersClient({
  closerKpis,
  leads,
  commissions,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );

  const currentLabel = useMemo(
    () => getFiscalMonth(parseLocalDate(selectedMonth)),
    [selectedMonth]
  );

  // Current month KPIs
  const currentKpis = useMemo(
    () => closerKpis.filter((k) => k.mes_fiscal === currentLabel),
    [closerKpis, currentLabel]
  );

  // Funnel data per closer
  const funnelData = useMemo(() => {
    return currentKpis.map((k) => ({
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

  // Commission table rows for current month
  const commissionRows = useMemo(() => {
    return commissions
      .filter((c) => c.mes_fiscal === currentLabel)
      .map((c) => ({
        nombre: c.nombre,
        comision_closer: c.comision_closer ?? 0,
        mes_fiscal: c.mes_fiscal,
      }))
      .filter((c) => c.comision_closer > 0)
      .sort((a, b) => b.comision_closer - a.comision_closer);
  }, [commissions, currentLabel]);

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
        <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
      </div>

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
                <div>
                  <p className="text-xs text-[var(--muted)]">Agendas</p>
                  <p className="text-lg font-bold text-white">
                    {k.total_agendas}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Presentadas</p>
                  <p className="text-lg font-bold text-white">
                    {k.presentadas}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Calificadas</p>
                  <p className="text-lg font-bold text-white">
                    {k.calificadas}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Cerradas</p>
                  <p className="text-lg font-bold text-[var(--green)]">
                    {k.cerradas}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--card-border)]">
                <div>
                  <p className="text-xs text-[var(--muted)]">Show Up %</p>
                  <p className="text-sm font-bold text-white">
                    {k.show_up_pct}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Cierre %</p>
                  <p className="text-sm font-bold text-white">
                    {k.cierre_pct}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">AOV</p>
                  <p className="text-sm font-bold text-white">
                    {formatUSD(k.aov)}
                  </p>
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
