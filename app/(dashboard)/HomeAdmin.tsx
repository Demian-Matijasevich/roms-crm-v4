"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import KPICard from "@/app/components/KPICard";
import MonthSelector77 from "@/app/components/MonthSelector77";
import SaleBanner from "@/app/components/SaleBanner";
import { formatUSD } from "@/lib/format";
import { getFiscalStart, getFiscalEnd, getFiscalMonth, parseLocalDate, toDateString } from "@/lib/date-utils";
import { subMonths } from "date-fns";
import type { MonthlyCash, Payment, Client, Commission } from "@/lib/types";

interface TeamCommission {
  id: string;
  nombre: string;
  comision_closer: number;
  comision_setter: number;
  comision_total: number;
}

interface RevPrediction {
  cashCollected: number;
  cuotasPendientes: number;
  pipelineTotal: number;
  pipelineCount: number;
  renewalCount: number;
  renewalAvgValue: number;
}

interface Props {
  monthlyCash: MonthlyCash[];
  payments: Payment[];
  overduePayments: Payment[];
  atRiskClients: Client[];
  commissions: Commission[];
  teamCommissions: TeamCommission[];
  revPrediction: RevPrediction;
}

function EditableTitle({ defaultLabel, storageKey }: { defaultLabel: string; storageKey: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(defaultLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setTitle(saved);
  }, [storageKey]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const save = useCallback(() => {
    setEditing(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== defaultLabel) {
      localStorage.setItem(storageKey, trimmed);
      setTitle(trimmed);
    } else {
      localStorage.removeItem(storageKey);
      setTitle(defaultLabel);
    }
  }, [title, defaultLabel, storageKey]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setTitle(defaultLabel); setEditing(false); } }}
        className="text-xs uppercase bg-transparent border-b border-[var(--purple)] text-[var(--muted)] outline-none w-full"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="text-xs text-[var(--muted)] uppercase cursor-pointer hover:text-[var(--purple-light)] transition-colors"
      title="Click para editar"
    >
      {title}
    </span>
  );
}

function KPICardEditable({
  label,
  storageKey,
  value,
  format = "number",
  delta,
  icon,
  valueClassName,
}: {
  label: string;
  storageKey: string;
  value: number;
  format?: "usd" | "pct" | "number";
  delta?: number | null;
  icon?: string;
  valueClassName?: string;
}) {
  const formatted =
    format === "usd" ? formatUSD(value) :
    format === "pct" ? `${value.toFixed(1)}%` :
    value.toLocaleString();

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <EditableTitle defaultLabel={label} storageKey={storageKey} />
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${valueClassName ?? "text-white"}`}>{formatted}</p>
      {delta !== undefined && delta !== null && (
        <p className={`text-xs mt-1 ${delta >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {delta >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(delta).toFixed(1)}% vs mes anterior
        </p>
      )}
    </div>
  );
}

export default function HomeAdmin({
  monthlyCash,
  payments,
  overduePayments,
  atRiskClients,
  commissions,
  teamCommissions,
  revPrediction,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );

  const currentLabel = useMemo(() => {
    const d = parseLocalDate(selectedMonth);
    return getFiscalMonth(d);
  }, [selectedMonth]);

  const prevLabel = useMemo(() => {
    const d = parseLocalDate(selectedMonth);
    return getFiscalMonth(subMonths(d, 1));
  }, [selectedMonth]);

  const current = useMemo(
    () => monthlyCash.find((m) => m.mes_fiscal === currentLabel),
    [monthlyCash, currentLabel]
  );

  const prev = useMemo(
    () => monthlyCash.find((m) => m.mes_fiscal === prevLabel),
    [monthlyCash, prevLabel]
  );

  function delta(curr: number | undefined, previous: number | undefined): number | null {
    if (!curr || !previous || previous === 0) return null;
    return ((curr - previous) / previous) * 100;
  }

  const facturacion = current?.facturacion ?? 0;
  const cashTotal = current?.cash_total ?? 0;
  const cashVentasNuevas = current?.cash_ventas_nuevas ?? 0;
  const cashRenovaciones = current?.cash_renovaciones ?? 0;
  const cashCuotas = current?.cash_cuotas ?? 0;
  const ventasNuevasCount = current?.ventas_nuevas_count ?? 0;
  const renovacionesCount = current?.renovaciones_count ?? 0;
  const refunds = current?.refunds ?? 0;
  const saldoPendiente = current?.saldo_pendiente_30d ?? 0;
  const ticketPromedio =
    ventasNuevasCount > 0 ? facturacion / ventasNuevasCount : 0;

  // Daily cumulative cash chart + daily bar chart data
  const dailyCashData = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = getFiscalEnd(start);
    const fiscalPayments = payments.filter((p) => {
      if (!p.fecha_pago || p.estado !== "pagado") return false;
      const d = parseLocalDate(p.fecha_pago);
      return d >= start && d <= end;
    });

    const dailyMap: Record<string, number> = {};
    for (const p of fiscalPayments) {
      const day = p.fecha_pago!;
      dailyMap[day] = (dailyMap[day] || 0) + p.monto_usd;
    }

    const sortedDays = Object.keys(dailyMap).sort();
    let cumulative = 0;
    let prevDaily = 0;
    return sortedDays.map((day, idx) => {
      const daily = dailyMap[day];
      cumulative += daily;
      const isUp = idx === 0 || daily >= prevDaily;
      prevDaily = daily;
      return {
        fecha: day,
        label: parseLocalDate(day).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
        }),
        cash: cumulative,
        daily,
        dailyColor: isUp ? "var(--green)" : "var(--red)",
      };
    });
  }, [payments, selectedMonth]);

  // Commissions from DB
  const commissionTotals = useMemo(() => {
    return teamCommissions.reduce(
      (acc, c) => ({
        closer: acc.closer + c.comision_closer,
        setter: acc.setter + c.comision_setter,
        total: acc.total + c.comision_total,
      }),
      { closer: 0, setter: 0, total: 0 }
    );
  }, [teamCommissions]);

  return (
    <div className="space-y-6">
      <SaleBanner />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Resumen del periodo {currentLabel}
          </p>
        </div>
        <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICardEditable
          label="Facturaci\u00f3n"
          storageKey="kpi_title_facturacion"
          value={facturacion}
          format="usd"
          delta={delta(facturacion, prev?.facturacion)}
          icon={"\u{1F4C8}"}
        />
        <KPICardEditable
          label="Cash Collected"
          storageKey="kpi_title_cash_collected"
          value={cashTotal}
          format="usd"
          delta={delta(cashTotal, prev?.cash_total)}
          icon={"\u{1F4B0}"}
        />
        <KPICardEditable
          label="Cuotas Cobradas"
          storageKey="kpi_title_cuotas_cobradas"
          value={cashCuotas}
          format="usd"
          icon={"\u{1F4CB}"}
        />
        <KPICardEditable
          label="Renovaciones"
          storageKey="kpi_title_renovaciones"
          value={cashRenovaciones}
          format="usd"
          delta={delta(cashRenovaciones, prev?.cash_renovaciones)}
          icon={"\u{1F504}"}
        />
        {refunds > 0 && (
          <KPICardEditable
            label="Refunds"
            storageKey="kpi_title_refunds"
            value={-refunds}
            format="usd"
            icon={"\u{1F6A8}"}
            valueClassName="text-[var(--red)]"
          />
        )}
        <KPICardEditable
          label="Ventas Nuevas"
          storageKey="kpi_title_ventas_nuevas"
          value={ventasNuevasCount}
          format="number"
          delta={delta(ventasNuevasCount, prev?.ventas_nuevas_count)}
          icon={"\u{1F680}"}
        />
        <KPICardEditable
          label="Ticket Promedio"
          storageKey="kpi_title_ticket_promedio"
          value={ticketPromedio}
          format="usd"
          icon={"\u{1F3AF}"}
        />
      </div>

      {/* Proyeccion del Mes */}
      {(() => {
        const RENEWAL_RATE = 0.4;
        const renewalExpected = revPrediction.renewalCount * revPrediction.renewalAvgValue * RENEWAL_RATE;
        const projected = revPrediction.cashCollected + revPrediction.cuotasPendientes + renewalExpected;
        const maxProjected = projected + revPrediction.pipelineTotal * 0.3;
        const pctCollected = maxProjected > 0 ? (revPrediction.cashCollected / maxProjected) * 100 : 0;
        const pctCuotas = maxProjected > 0 ? (revPrediction.cuotasPendientes / maxProjected) * 100 : 0;
        const pctRenewals = maxProjected > 0 ? (renewalExpected / maxProjected) * 100 : 0;
        const pctPipeline = maxProjected > 0 ? ((revPrediction.pipelineTotal * 0.3) / maxProjected) * 100 : 0;

        const pctOfMax = maxProjected > 0 ? Math.round((revPrediction.cashCollected / maxProjected) * 100) : 0;

        return (
          <div className="relative bg-[var(--card-bg)] border-2 border-[var(--purple)]/40 rounded-xl p-6 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--purple)]/10 via-transparent to-[var(--green)]/5 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-white">Proyeccion del Mes</h2>
                <span className="text-2xl font-bold text-[var(--purple-light)]">{pctOfMax}% del objetivo</span>
              </div>
              <p className="text-sm text-[var(--muted)] mb-5">
                Cobrado: <span className="text-[var(--green)] font-semibold">{formatUSD(revPrediction.cashCollected)}</span> / Proyectado: <span className="text-white font-semibold">{formatUSD(Math.round(maxProjected))}</span>
              </p>

              <div className="w-full h-10 rounded-full bg-white/10 overflow-hidden flex mb-5 shadow-inner">
                <div
                  className="h-full bg-[var(--green)] transition-all duration-500 progress-bar-animated"
                  style={{ width: `${Math.min(pctCollected, 100)}%` }}
                  title={`Cobrado: ${formatUSD(revPrediction.cashCollected)}`}
                />
                <div
                  className="h-full bg-[var(--yellow)]/70 border-l-2 border-dashed border-[var(--yellow)]"
                  style={{ width: `${Math.min(pctCuotas, 100 - pctCollected)}%` }}
                  title={`Cuotas esperadas: ${formatUSD(revPrediction.cuotasPendientes)}`}
                />
                <div
                  className="h-full bg-emerald-500/60 border-l-2 border-dashed border-emerald-400"
                  style={{ width: `${Math.min(pctRenewals, 100 - pctCollected - pctCuotas)}%` }}
                  title={`Renovaciones: ${formatUSD(Math.round(renewalExpected))}`}
                />
                <div
                  className="h-full bg-blue-500/30 border-l-2 border-dashed border-blue-400"
                  style={{ width: `${Math.min(pctPipeline, 100 - pctCollected - pctCuotas - pctRenewals)}%` }}
                  title={`Pipeline: ${formatUSD(Math.round(revPrediction.pipelineTotal * 0.3))}`}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2 bg-[var(--green)]/10 rounded-lg px-3 py-2">
                  <span className="w-3 h-3 rounded-sm bg-[var(--green)]" />
                  <div>
                    <p className="text-white font-semibold">{formatUSD(revPrediction.cashCollected)}</p>
                    <p className="text-[var(--muted)] text-xs">Cobrado</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[var(--yellow)]/10 rounded-lg px-3 py-2">
                  <span className="w-3 h-3 rounded-sm bg-[var(--yellow)] border border-dashed border-[var(--yellow)]" />
                  <div>
                    <p className="text-white font-semibold">{formatUSD(revPrediction.cuotasPendientes)}</p>
                    <p className="text-[var(--muted)] text-xs">Cuotas esperadas</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 rounded-lg px-3 py-2">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <div>
                    <p className="text-white font-semibold">{formatUSD(Math.round(renewalExpected))}</p>
                    <p className="text-[var(--muted)] text-xs">Renovaciones ({revPrediction.renewalCount})</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-blue-500/10 rounded-lg px-3 py-2">
                  <span className="w-3 h-3 rounded-sm bg-blue-500/50" />
                  <div>
                    <p className="text-white font-semibold">{formatUSD(revPrediction.pipelineTotal)}</p>
                    <p className="text-[var(--muted)] text-xs">Pipeline ({revPrediction.pipelineCount} leads)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cash Acumulado Chart with Projection Line */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Cash Collected Diario Acumulado
        </h2>
        {dailyCashData.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-8 text-center">
            Sin datos para este periodo
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={(() => {
              const todayStr = toDateString(new Date());
              const RENEWAL_RATE = 0.4;
              const renewalExpected = revPrediction.renewalCount * revPrediction.renewalAvgValue * RENEWAL_RATE;
              const projectedTotal = revPrediction.cashCollected + revPrediction.cuotasPendientes + renewalExpected + revPrediction.pipelineTotal * 0.3;

              const start = parseLocalDate(selectedMonth);
              const end = getFiscalEnd(start);
              const endStr = toDateString(end);

              const chartData = dailyCashData.map((d) => {
                const isPast = d.fecha <= todayStr;
                return {
                  ...d,
                  cash: isPast ? d.cash : undefined,
                  projection: undefined as number | undefined,
                };
              });

              const lastActual = [...dailyCashData].reverse().find((d) => d.fecha <= todayStr);
              const todayCumulative = lastActual?.cash ?? 0;

              if (lastActual) {
                const lastActualIdx = chartData.findIndex((d) => d.fecha === lastActual.fecha);
                if (lastActualIdx >= 0) {
                  chartData[lastActualIdx].projection = todayCumulative;
                }
              }

              const endLabel = parseLocalDate(endStr).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "short",
              });
              chartData.push({
                fecha: endStr,
                label: endLabel + " (proy.)",
                cash: undefined,
                daily: 0,
                dailyColor: "var(--green)",
                projection: Math.round(projectedTotal),
              } as any);

              return chartData;
            })()}>
              <defs>
                <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis
                dataKey="label"
                stroke="var(--muted)"
                fontSize={11}
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
                formatter={(value, name) => {
                  if (name === "projection") return [formatUSD(Number(value)), "Proyectado"];
                  if (name === "cash") return [formatUSD(Number(value)), "Cash acumulado"];
                  return [formatUSD(Number(value)), String(name)];
                }}
                labelFormatter={(label) => String(label)}
              />
              <Area
                type="monotone"
                dataKey="cash"
                stroke="var(--green)"
                strokeWidth={2}
                fill="url(#cashGradient)"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="projection"
                stroke="#60a5fa"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={{ r: 5, fill: "#60a5fa" }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily Cash Bar Chart (green/red) */}
      {dailyCashData.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Cash Diario
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyCashData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis
                dataKey="label"
                stroke="var(--muted)"
                fontSize={11}
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
                formatter={(value) => [formatUSD(Number(value)), "Cash del dia"]}
                labelFormatter={(label) => String(label)}
              />
              <Bar dataKey="daily" radius={[4, 4, 0, 0]}>
                {dailyCashData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.dailyColor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[var(--green)]" /> Mayor o igual que el dia anterior</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[var(--red)]" /> Menor que el dia anterior</span>
          </div>
        </div>
      )}

      {/* Comisiones del Equipo */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Comisiones del Equipo
        </h2>
        {teamCommissions.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-4 text-center">
            Sin comisiones en este periodo
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="pb-3 pr-4 font-medium">Nombre</th>
                  <th className="pb-3 pr-4 font-medium text-right">Closer (10%)</th>
                  <th className="pb-3 pr-4 font-medium text-right">Setter (5%)</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {teamCommissions.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--card-border)]/50"
                  >
                    <td className="py-3 pr-4 text-white font-medium">{c.nombre}</td>
                    <td className="py-3 pr-4 text-right text-[var(--muted)]">
                      {c.comision_closer > 0 ? formatUSD(c.comision_closer) : "\u2014"}
                    </td>
                    <td className="py-3 pr-4 text-right text-[var(--muted)]">
                      {c.comision_setter > 0 ? formatUSD(c.comision_setter) : "\u2014"}
                    </td>
                    <td className="py-3 text-right text-white font-bold">
                      {formatUSD(c.comision_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--card-border)]">
                  <td className="pt-3 pr-4 text-white font-bold">Total</td>
                  <td className="pt-3 pr-4 text-right text-white font-semibold">
                    {formatUSD(commissionTotals.closer)}
                  </td>
                  <td className="pt-3 pr-4 text-right text-white font-semibold">
                    {formatUSD(commissionTotals.setter)}
                  </td>
                  <td className="pt-3 text-right text-[var(--green)] font-bold text-base">
                    {formatUSD(commissionTotals.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Alert Cards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Clientes en Riesgo */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Clientes en Riesgo
            </h2>
            <span className="text-xs bg-[var(--yellow)]/15 text-[var(--yellow)] px-2 py-1 rounded-full font-medium">
              {atRiskClients.length}
            </span>
          </div>
          {atRiskClients.length === 0 ? (
            <p className="text-[var(--muted)] text-sm">
              Sin clientes en riesgo
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {atRiskClients.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-[var(--yellow)]/5 border border-[var(--yellow)]/10 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-white font-medium">{c.nombre}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {c.programa ?? "Sin programa"}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[var(--yellow)]">
                    Score: {c.health_score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
