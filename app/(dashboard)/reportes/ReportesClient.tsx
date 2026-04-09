"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import KPICard from "@/app/components/KPICard";
import DataTable from "@/app/components/DataTable";
import type { TeamMember } from "@/lib/types";
import type { DailyReportWithSetter, SetterAggregates } from "@/lib/queries/daily-reports";
import { formatDate } from "@/lib/format";

interface Props {
  reports: DailyReportWithSetter[];
  aggregates: SetterAggregates[];
  setters: Pick<TeamMember, "id" | "nombre">[];
}

const SETTER_COLORS = ["#8b5cf6", "#22c55e", "#3b82f6", "#eab308", "#ef4444", "#ec4899"];

export default function ReportesClient({ reports, aggregates, setters }: Props) {
  const [filterSetter, setFilterSetter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filter reports
  const filtered = useMemo(() => {
    let result = reports;
    if (filterSetter) {
      result = result.filter((r) => r.setter_id === filterSetter);
    }
    if (dateFrom) {
      result = result.filter((r) => r.fecha >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((r) => r.fecha <= dateTo);
    }
    return result;
  }, [reports, filterSetter, dateFrom, dateTo]);

  // Totals
  const totals = useMemo(() => {
    return aggregates.reduce(
      (acc, a) => ({
        conversaciones: acc.conversaciones + a.total_conversaciones,
        calendarios: acc.calendarios + a.total_calendarios,
        agendas: acc.agendas + a.total_agendas.length,
      }),
      { conversaciones: 0, calendarios: 0, agendas: 0 }
    );
  }, [aggregates]);

  // Chart data -- group by fecha, split by setter
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const r of filtered) {
      const entry = byDate.get(r.fecha) ?? { fecha: r.fecha };
      const setterName = r.setter?.nombre ?? "\u2014";
      entry[setterName] = ((entry[setterName] as number) || 0) + r.conversaciones_iniciadas;
      byDate.set(r.fecha, entry);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, vals]) => ({ fecha, ...vals }));
  }, [filtered]);

  const setterNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of filtered) {
      if (r.setter?.nombre) names.add(r.setter.nombre);
    }
    return Array.from(names);
  }, [filtered]);

  // Table columns
  const columns = [
    {
      key: "fecha",
      label: "Fecha",
      sortable: true,
      render: (row: DailyReportWithSetter) => formatDate(row.fecha),
    },
    {
      key: "setter",
      label: "Setter",
      render: (row: DailyReportWithSetter) => row.setter?.nombre ?? "\u2014",
    },
    {
      key: "conversaciones_iniciadas",
      label: "Conversaciones",
      sortable: true,
      render: (row: DailyReportWithSetter) => row.conversaciones_iniciadas,
    },
    {
      key: "respuestas_historias",
      label: "Resp. Historias",
      sortable: true,
      render: (row: DailyReportWithSetter) => row.respuestas_historias,
    },
    {
      key: "calendarios_enviados",
      label: "Calendarios",
      sortable: true,
      render: (row: DailyReportWithSetter) => row.calendarios_enviados,
    },
    {
      key: "ventas_por_chat",
      label: "Ventas Chat",
      render: (row: DailyReportWithSetter) => row.ventas_por_chat || "\u2014",
    },
    {
      key: "agendas_confirmadas",
      label: "Agendas",
      render: (row: DailyReportWithSetter) => row.agendas_confirmadas || "\u2014",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Reportes Diarios</h1>
        <p className="text-sm text-[var(--muted)]">Actividad de setters — periodo 7-7 actual</p>
      </div>

      {/* KPI Cards -- aggregated for current 7-7 */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard label="Total Conversaciones" value={totals.conversaciones} />
        <KPICard label="Total Calendarios" value={totals.calendarios} />
        <KPICard label="Total Agendas" value={totals.agendas} />
      </div>

      {/* Aggregated by setter */}
      {aggregates.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Acumulado por Setter (periodo 7-7)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase">
                  <th className="text-left py-1">Setter</th>
                  <th className="text-right py-1">Conversaciones</th>
                  <th className="text-right py-1">Resp. Historias</th>
                  <th className="text-right py-1">Calendarios</th>
                  <th className="text-right py-1">Reportes</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((a) => (
                  <tr key={a.setter_id} className="border-t border-[var(--card-border)]">
                    <td className="py-1.5 text-white font-medium">{a.setter_nombre}</td>
                    <td className="py-1.5 text-right text-white">{a.total_conversaciones}</td>
                    <td className="py-1.5 text-right text-white">{a.total_respuestas_historias}</td>
                    <td className="py-1.5 text-right text-white">{a.total_calendarios}</td>
                    <td className="py-1.5 text-right text-[var(--muted)]">{a.report_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity chart */}
      {chartData.length > 1 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Conversaciones por Dia</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="fecha" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }}
                labelStyle={{ color: "#e5e5e5" }}
              />
              <Legend />
              {setterNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={SETTER_COLORS[i % SETTER_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Setter</label>
          <select
            value={filterSetter}
            onChange={(e) => setFilterSetter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          >
            <option value="">Todos</option>
            {setters.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={filtered as unknown as Record<string, unknown>[]}
        columns={columns as unknown as { key: string; label: string; sortable?: boolean; render?: (row: Record<string, unknown>) => React.ReactNode }[]}
        searchKey={"setter" as keyof Record<string, unknown>}
        searchPlaceholder="Buscar setter..."
        pageSize={20}
      />
    </div>
  );
}
