"use client";

import { useState, useMemo, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD, formatARS } from "@/lib/format";
import { getFiscalStart, getFiscalMonth, getFiscalMonthOptions, parseLocalDate } from "@/lib/date-utils";
import { RECEPTORES } from "@/lib/constants";
import type { TreasuryRow } from "@/lib/types";

interface Props {
  rows: TreasuryRow[];
}

const RECEPTOR_COLORS: Record<string, string> = {
  "Mercado Pago": "#8b5cf6",
  Transferencia: "#10b981",
  Cash: "#ef4444",
  Binance: "#f59e0b",
  Stripe: "#3b82f6",
  Wise: "#06b6d4",
};

export default function TesoreriaClient({ rows }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );
  const [filterMetodo, setFilterMetodo] = useState<string>("todos");
  const printRef = useRef<HTMLDivElement>(null);

  const currentLabel = useMemo(() => {
    return getFiscalMonth(parseLocalDate(selectedMonth));
  }, [selectedMonth]);

  // Filter rows by selected fiscal month and metodo_pago
  const filtered = useMemo(() => {
    let result = rows.filter((r) => r.mes_fiscal === currentLabel);
    if (filterMetodo !== "todos") {
      result = result.filter((r) => r.metodo_pago === filterMetodo);
    }
    return result;
  }, [rows, currentLabel, filterMetodo]);

  // Group by receptor for summary cards
  const byReceptor = useMemo(() => {
    const map: Record<string, { total_usd: number; total_ars: number }> = {};
    for (const r of filtered) {
      if (!map[r.receptor]) map[r.receptor] = { total_usd: 0, total_ars: 0 };
      map[r.receptor].total_usd += r.total_usd ?? 0;
      map[r.receptor].total_ars += r.total_ars ?? 0;
    }
    return Object.entries(map)
      .map(([receptor, totals]) => ({ receptor, ...totals }))
      .sort((a, b) => b.total_usd - a.total_usd);
  }, [filtered]);

  // Breakdown table rows
  const breakdownRows = useMemo(() => {
    const map: Record<
      string,
      {
        receptor: string;
        metodo_pago: string;
        ventas_nuevas: number;
        cuotas: number;
        renovaciones: number;
        total: number;
      }
    > = {};
    for (const r of filtered) {
      const key = `${r.receptor}__${r.metodo_pago ?? "N/A"}`;
      if (!map[key]) {
        map[key] = {
          receptor: r.receptor,
          metodo_pago: r.metodo_pago ?? "N/A",
          ventas_nuevas: 0,
          cuotas: 0,
          renovaciones: 0,
          total: 0,
        };
      }
      map[key].ventas_nuevas += r.usd_ventas_nuevas ?? 0;
      map[key].cuotas += r.usd_cuotas ?? 0;
      map[key].renovaciones += r.usd_renovaciones ?? 0;
      map[key].total += r.total_usd ?? 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Grand totals
  const grandTotalUSD = byReceptor.reduce((s, r) => s + r.total_usd, 0);
  const grandTotalARS = byReceptor.reduce((s, r) => s + r.total_ars, 0);

  // Stacked bar chart data — last 6 months by receptor
  const chartData = useMemo(() => {
    const months = getFiscalMonthOptions(6).reverse();
    return months.map((m) => {
      const monthRows = rows.filter((r) => r.mes_fiscal === m.label);
      const entry: Record<string, string | number> = { mes: m.label };
      for (const receptor of RECEPTORES) {
        const receptorRows = monthRows.filter((r) => r.receptor === receptor);
        entry[receptor] = receptorRows.reduce(
          (s, r) => s + (r.total_usd ?? 0),
          0
        );
      }
      return entry;
    });
  }, [rows]);

  // Unique metodo_pago values for filter
  const metodos = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.metodo_pago) set.add(r.metodo_pago);
    }
    return Array.from(set).sort();
  }, [rows]);

  function handleExportPDF() {
    window.print();
  }

  return (
    <div className="space-y-6" ref={printRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tesoreria</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Flujo de dinero por receptor &mdash; {currentLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterMetodo}
            onChange={(e) => setFilterMetodo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          >
            <option value="todos">Todos los metodos</option>
            {metodos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm font-medium hover:bg-[var(--purple-light)] transition-colors print:hidden"
          >
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Receptor Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {byReceptor.map((r) => (
          <div
            key={r.receptor}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4"
          >
            <p className="text-xs text-[var(--muted)] uppercase mb-1">
              {r.receptor}
            </p>
            <p className="text-xl font-bold text-white">
              {formatUSD(r.total_usd)}
            </p>
            {r.total_ars > 0 && (
              <p className="text-xs text-[var(--muted)] mt-1">
                {formatARS(r.total_ars)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Grand Totals */}
      <div className="flex gap-4">
        <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl px-6 py-4">
          <p className="text-xs text-[var(--muted)] uppercase">Total USD</p>
          <p className="text-2xl font-bold text-[var(--green)]">
            {formatUSD(grandTotalUSD)}
          </p>
        </div>
        {grandTotalARS > 0 && (
          <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl px-6 py-4">
            <p className="text-xs text-[var(--muted)] uppercase">Total ARS</p>
            <p className="text-2xl font-bold text-[var(--green)]">
              {formatARS(grandTotalARS)}
            </p>
          </div>
        )}
      </div>

      {/* Breakdown Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Desglose</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--muted)] text-xs uppercase">
                <th className="text-left py-2 px-3">Receptor</th>
                <th className="text-left py-2 px-3">Metodo</th>
                <th className="text-right py-2 px-3">Ventas Nuevas</th>
                <th className="text-right py-2 px-3">Cuotas</th>
                <th className="text-right py-2 px-3">Renovaciones</th>
                <th className="text-right py-2 px-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-[var(--card-border)]"
                >
                  <td className="py-2 px-3 text-white font-medium">
                    {r.receptor}
                  </td>
                  <td className="py-2 px-3 text-[var(--muted)]">
                    {r.metodo_pago}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatUSD(r.ventas_nuevas)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatUSD(r.cuotas)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatUSD(r.renovaciones)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                    {formatUSD(r.total)}
                  </td>
                </tr>
              ))}
              {breakdownRows.length > 0 && (
                <tr className="border-t-2 border-[var(--purple)] font-bold">
                  <td className="py-2 px-3 text-white" colSpan={2}>
                    TOTAL
                  </td>
                  <td className="py-2 px-3 text-right text-white">
                    {formatUSD(
                      breakdownRows.reduce((s, r) => s + r.ventas_nuevas, 0)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-white">
                    {formatUSD(
                      breakdownRows.reduce((s, r) => s + r.cuotas, 0)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-white">
                    {formatUSD(
                      breakdownRows.reduce((s, r) => s + r.renovaciones, 0)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-[var(--green)]">
                    {formatUSD(grandTotalUSD)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stacked Bar Chart — last 6 months */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Cash por Receptor (ultimos 6 meses)
        </h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
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
              tickFormatter={(v: number) => formatUSD(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "white",
              }}
              formatter={(value) => [
                formatUSD(Number(value)),
                "",
              ]}
            />
            <Legend />
            {RECEPTORES.map((receptor) => (
              <Bar
                key={receptor}
                dataKey={receptor}
                stackId="a"
                fill={RECEPTOR_COLORS[receptor] ?? "#6b7280"}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
