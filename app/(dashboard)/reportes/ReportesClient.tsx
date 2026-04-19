"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import KPICard from "@/app/components/KPICard";
import type { TeamMember } from "@/lib/types";
import type { DailyReportWithSetter, SetterAggregates } from "@/lib/queries/daily-reports";

interface Props {
  reports: DailyReportWithSetter[];
  aggregates: SetterAggregates[];
  setters: Pick<TeamMember, "id" | "nombre">[];
}

const SETTER_COLORS = ["#8b5cf6", "#22c55e", "#3b82f6", "#eab308", "#ef4444", "#ec4899"];

export default function ReportesClient({ reports, aggregates, setters }: Props) {
  const [localReports, setLocalReports] = useState<DailyReportWithSetter[]>(reports);
  const [filterSetter, setFilterSetter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filter reports
  const filtered = useMemo(() => {
    let result = localReports;
    if (filterSetter) {
      result = result.filter((r) => r.setter_id === filterSetter);
    }
    if (dateFrom) {
      result = result.filter((r) => r.fecha >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((r) => r.fecha <= dateTo);
    }
    return result.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [localReports, filterSetter, dateFrom, dateTo]);

  async function updateReport(id: string, field: string, value: string | number | null) {
    try {
      const res = await fetch("/api/reporte-setter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocalReports((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deleteReport(id: string, setterName: string, fecha: string) {
    if (!confirm(`Borrar reporte de ${setterName} del ${fecha}?`)) return;
    const res = await fetch(`/api/reporte-setter?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setLocalReports((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert("Error: " + (json.error || "desconocido"));
    }
  }

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Reportes Diarios</h1>
        <p className="text-sm text-[var(--muted)]">Actividad de setters — mes fiscal actual</p>
      </div>

      {/* Empty state */}
      {reports.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center space-y-3">
          <div className="text-4xl">📋</div>
          <h3 className="text-base font-semibold text-white">Sin reportes cargados</h3>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Los setters no cargaron ningún reporte diario todavía. Pediles que completen su reporte desde <b>Cargar Llamada → Reporte Setter</b> al final de cada día (conversaciones iniciadas, respuestas a historias, calendarios enviados, agendas confirmadas).
          </p>
          <a href="/form/reporte-setter" className="inline-block mt-2 px-4 py-2 rounded-lg bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white text-sm font-medium">
            Cargar reporte ahora
          </a>
        </div>
      )}

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

      {/* Editable Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Reportes diarios ({filtered.length})</h3>
          <span className="text-xs text-[var(--muted)]">Click en cualquier celda para editar</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-[var(--background)] text-left text-[var(--muted)] text-[10px] uppercase">
                <th className="py-2 px-2 w-[110px]">Fecha</th>
                <th className="py-2 px-2 w-[120px]">Setter</th>
                <th className="py-2 px-2 text-right w-[90px]">Conv.</th>
                <th className="py-2 px-2 text-right w-[90px]">Resp. Hist.</th>
                <th className="py-2 px-2 text-right w-[90px]">Calend.</th>
                <th className="py-2 px-2">Ventas chat</th>
                <th className="py-2 px-2">Agendas conf.</th>
                <th className="py-2 px-2 text-right w-[60px]">Acc.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-[var(--muted)]">Sin reportes</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                  <td className="py-1 px-2">
                    <input type="date" defaultValue={r.fecha}
                      onBlur={(e) => { if (e.target.value && e.target.value !== r.fecha) updateReport(r.id, "fecha", e.target.value); }}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2">
                    <select defaultValue={r.setter_id}
                      onChange={(e) => updateReport(r.id, "setter_id", e.target.value)}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-[11px] text-white focus:outline-none">
                      {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
                    </select>
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input type="number" min={0} defaultValue={r.conversaciones_iniciadas}
                      onBlur={(e) => { const v = parseInt(e.target.value); if (Number.isFinite(v) && v !== r.conversaciones_iniciadas) updateReport(r.id, "conversaciones_iniciadas", v); }}
                      className="w-16 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input type="number" min={0} defaultValue={r.respuestas_historias}
                      onBlur={(e) => { const v = parseInt(e.target.value); if (Number.isFinite(v) && v !== r.respuestas_historias) updateReport(r.id, "respuestas_historias", v); }}
                      className="w-16 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input type="number" min={0} defaultValue={r.calendarios_enviados}
                      onBlur={(e) => { const v = parseInt(e.target.value); if (Number.isFinite(v) && v !== r.calendarios_enviados) updateReport(r.id, "calendarios_enviados", v); }}
                      className="w-16 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2">
                    <input type="text" defaultValue={r.ventas_por_chat || ""}
                      onBlur={(e) => { if (e.target.value !== (r.ventas_por_chat || "")) updateReport(r.id, "ventas_por_chat", e.target.value || null); }}
                      className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2">
                    <input type="text" defaultValue={r.agendas_confirmadas || ""}
                      onBlur={(e) => { if (e.target.value !== (r.agendas_confirmadas || "")) updateReport(r.id, "agendas_confirmadas", e.target.value || null); }}
                      className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <button
                      onClick={() => deleteReport(r.id, r.setter?.nombre || "", r.fecha)}
                      className="text-[11px] text-[var(--red)] hover:underline"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
