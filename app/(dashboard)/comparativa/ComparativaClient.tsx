"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD } from "@/lib/format";
import { getFiscalStart, getFiscalMonth, parseLocalDate } from "@/lib/date-utils";
import { subMonths } from "date-fns";
import type { MonthlyCash, Lead } from "@/lib/types";

interface Props {
  monthlyCash: MonthlyCash[];
  leads: Pick<Lead, "id" | "estado" | "ticket_total" | "fecha_llamada" | "closer_id">[];
}

interface MetricRow {
  label: string;
  key: string;
  mesA: number;
  mesB: number;
  delta: number | null;
  format: "usd" | "number" | "pct" | "pp";
}

function formatValue(value: number, fmt: "usd" | "number" | "pct" | "pp"): string {
  if (fmt === "usd") return formatUSD(value);
  if (fmt === "pct") return `${value.toFixed(1)}%`;
  if (fmt === "pp") return `${value.toFixed(1)}pp`;
  return value.toLocaleString();
}

function formatDelta(delta: number | null, fmt: "usd" | "number" | "pct" | "pp"): string {
  if (delta === null) return "--";
  if (fmt === "pp") {
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}pp`;
  }
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

export default function ComparativaClient({ monthlyCash, leads }: Props) {
  const currentFiscalStart = getFiscalStart().toISOString().split("T")[0];
  const prevFiscalStart = getFiscalStart(subMonths(new Date(), 1)).toISOString().split("T")[0];

  const [mesA, setMesA] = useState(currentFiscalStart);
  const [mesB, setMesB] = useState(prevFiscalStart);

  const labelA = useMemo(() => getFiscalMonth(parseLocalDate(mesA)), [mesA]);
  const labelB = useMemo(() => getFiscalMonth(parseLocalDate(mesB)), [mesB]);

  const dataA = useMemo(() => monthlyCash.find((m) => m.mes_fiscal === labelA), [monthlyCash, labelA]);
  const dataB = useMemo(() => monthlyCash.find((m) => m.mes_fiscal === labelB), [monthlyCash, labelB]);

  // Compute leads with calls in each fiscal month for cierre rate
  const leadsInMonth = useMemo(() => {
    function getMonthLeads(label: string) {
      return leads.filter((l) => {
        if (!l.fecha_llamada) return false;
        const d = parseLocalDate(l.fecha_llamada.split("T")[0]);
        return getFiscalMonth(d) === label;
      });
    }
    const aLeads = getMonthLeads(labelA);
    const bLeads = getMonthLeads(labelB);

    const cierreA = aLeads.length > 0
      ? (aLeads.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento").length / aLeads.length) * 100
      : 0;
    const cierreB = bLeads.length > 0
      ? (bLeads.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento").length / bLeads.length) * 100
      : 0;

    return { cierreA, cierreB, llamadasA: aLeads.length, llamadasB: bLeads.length };
  }, [leads, labelA, labelB]);

  function delta(a: number, b: number): number | null {
    if (b === 0) return null;
    return ((a - b) / b) * 100;
  }

  const ticketA = (dataA?.ventas_nuevas_count ?? 0) > 0
    ? (dataA?.facturacion ?? 0) / (dataA?.ventas_nuevas_count ?? 1)
    : 0;
  const ticketB = (dataB?.ventas_nuevas_count ?? 0) > 0
    ? (dataB?.facturacion ?? 0) / (dataB?.ventas_nuevas_count ?? 1)
    : 0;

  const metrics: MetricRow[] = [
    {
      label: "Cash Collected",
      key: "cash",
      mesA: dataA?.cash_total ?? 0,
      mesB: dataB?.cash_total ?? 0,
      delta: delta(dataA?.cash_total ?? 0, dataB?.cash_total ?? 0),
      format: "usd",
    },
    {
      label: "Ventas Nuevas",
      key: "ventas",
      mesA: dataA?.ventas_nuevas_count ?? 0,
      mesB: dataB?.ventas_nuevas_count ?? 0,
      delta: delta(dataA?.ventas_nuevas_count ?? 0, dataB?.ventas_nuevas_count ?? 0),
      format: "number",
    },
    {
      label: "Cuotas",
      key: "cuotas",
      mesA: dataA?.cash_cuotas ?? 0,
      mesB: dataB?.cash_cuotas ?? 0,
      delta: delta(dataA?.cash_cuotas ?? 0, dataB?.cash_cuotas ?? 0),
      format: "usd",
    },
    {
      label: "Renovaciones",
      key: "renovaciones",
      mesA: dataA?.cash_renovaciones ?? 0,
      mesB: dataB?.cash_renovaciones ?? 0,
      delta: delta(dataA?.cash_renovaciones ?? 0, dataB?.cash_renovaciones ?? 0),
      format: "usd",
    },
    {
      label: "Ticket Promedio",
      key: "ticket",
      mesA: ticketA,
      mesB: ticketB,
      delta: delta(ticketA, ticketB),
      format: "usd",
    },
    {
      label: "Cierre Rate",
      key: "cierre",
      mesA: leadsInMonth.cierreA,
      mesB: leadsInMonth.cierreB,
      delta: leadsInMonth.cierreA - leadsInMonth.cierreB !== 0
        ? leadsInMonth.cierreA - leadsInMonth.cierreB
        : null,
      format: "pp",
    },
  ];

  const chartData = metrics
    .filter((m) => m.format === "usd")
    .map((m) => ({
      name: m.label,
      [labelA]: m.mesA,
      [labelB]: m.mesB,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Comparativa Mes a Mes</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Compara metricas entre dos periodos fiscales
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Mes A</label>
            <MonthSelector77 value={mesA} onChange={setMesA} />
          </div>
          <span className="text-[var(--muted)] text-lg mt-4">vs</span>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Mes B</label>
            <MonthSelector77 value={mesB} onChange={setMesB} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="px-6 py-4 font-medium">Metrica</th>
                <th className="px-6 py-4 font-medium text-right">{labelA}</th>
                <th className="px-6 py-4 font-medium text-right">{labelB}</th>
                <th className="px-6 py-4 font-medium text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const isPositive = m.delta !== null && m.delta > 0;
                const isNegative = m.delta !== null && m.delta < 0;
                return (
                  <tr key={m.key} className="border-b border-[var(--card-border)]/50 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{m.label}</td>
                    <td className="px-6 py-4 text-right text-white">
                      {formatValue(m.mesA, m.format === "pp" ? "pct" : m.format)}
                    </td>
                    <td className="px-6 py-4 text-right text-[var(--muted)]">
                      {formatValue(m.mesB, m.format === "pp" ? "pct" : m.format)}
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${
                      isPositive ? "text-[var(--green)]" : isNegative ? "text-[var(--red)]" : "text-[var(--muted)]"
                    }`}>
                      {formatDelta(m.delta, m.format)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Comparacion Visual (USD)
        </h2>
        {chartData.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-8 text-center">
            Sin datos para comparar
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis
                dataKey="name"
                stroke="var(--muted)"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v: number) => formatUSD(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "8px",
                  color: "white",
                }}
                formatter={(value) => [formatUSD(Number(value)), ""]}
              />
              <Legend />
              <Bar dataKey={labelA} fill="var(--purple)" radius={[4, 4, 0, 0]} />
              <Bar dataKey={labelB} fill="var(--muted)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Extra context: calls & cierre */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-3">Llamadas</h3>
          <div className="flex justify-between items-center">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{leadsInMonth.llamadasA}</p>
              <p className="text-xs text-[var(--muted)]">{labelA}</p>
            </div>
            <span className="text-[var(--muted)]">vs</span>
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--muted)]">{leadsInMonth.llamadasB}</p>
              <p className="text-xs text-[var(--muted)]">{labelB}</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-3">Cierre Rate</h3>
          <div className="flex justify-between items-center">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{leadsInMonth.cierreA.toFixed(1)}%</p>
              <p className="text-xs text-[var(--muted)]">{labelA}</p>
            </div>
            <span className="text-[var(--muted)]">vs</span>
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--muted)]">{leadsInMonth.cierreB.toFixed(1)}%</p>
              <p className="text-xs text-[var(--muted)]">{labelB}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
