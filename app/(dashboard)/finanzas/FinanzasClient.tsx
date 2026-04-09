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
  Legend,
} from "recharts";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD, formatARS } from "@/lib/format";
import {
  getFiscalStart,
  getFiscalMonth,
  getFiscalMonthOptions,
  parseLocalDate,
} from "@/lib/date-utils";
import { RECEPTORES } from "@/lib/constants";
import type { MonthlyCash, TreasuryRow, Commission } from "@/lib/types";
import type { GastoRow } from "./page";

interface PaymentRow {
  id: string;
  monto_usd: number;
  receptor: string | null;
  fecha_pago: string | null;
  estado: string;
  metodo_pago: string | null;
}

interface Props {
  monthlyCash: MonthlyCash[];
  commissions: Commission[];
  treasury: TreasuryRow[];
  gastos: GastoRow[];
  payments: PaymentRow[];
  currentFiscalMonth: string;
}

const RECEPTOR_COLORS: Record<string, string> = {
  "Mercado Pago": "#8b5cf6",
  Transferencia: "#10b981",
  Cash: "#ef4444",
  Binance: "#f59e0b",
  Stripe: "#3b82f6",
  Wise: "#06b6d4",
};

function gastoFiscalMonth(fecha: string): string {
  const d = parseLocalDate(fecha);
  return getFiscalMonth(d);
}

export default function FinanzasClient({
  monthlyCash,
  commissions,
  treasury,
  gastos,
  payments,
  currentFiscalMonth,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );
  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoForm, setGastoForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    concepto: "",
    categoria: "",
    monto_usd: "",
    monto_ars: "",
    billetera: "",
    pagado_a: "",
    pagado_por: "",
    estado: "pagado",
  });
  const [submitting, setSubmitting] = useState(false);
  const [localGastos, setLocalGastos] = useState<GastoRow[]>(gastos);

  const currentLabel = useMemo(() => {
    return getFiscalMonth(parseLocalDate(selectedMonth));
  }, [selectedMonth]);

  // ────── P&L DATA ──────
  const monthCash = useMemo(
    () => monthlyCash.find((m) => m.mes_fiscal === currentLabel),
    [monthlyCash, currentLabel]
  );

  const monthCommissions = useMemo(
    () => commissions.filter((c) => c.mes_fiscal === currentLabel),
    [commissions, currentLabel]
  );

  const monthGastos = useMemo(
    () => localGastos.filter((g) => gastoFiscalMonth(g.fecha) === currentLabel),
    [localGastos, currentLabel]
  );

  // Ingresos
  const cashVentasNuevas = monthCash?.cash_ventas_nuevas ?? 0;
  const cashCuotas = monthCash?.cash_cuotas ?? 0;
  const cashRenovaciones = monthCash?.cash_renovaciones ?? 0;
  const totalIngresos = cashVentasNuevas + cashCuotas + cashRenovaciones;

  // Egresos
  const totalGastosOp = monthGastos.reduce((s, g) => s + (g.monto_usd || 0), 0);
  const totalComisionesClosers = monthCommissions.reduce(
    (s, c) => s + c.comision_closer,
    0
  );
  const totalComisionesSetters = monthCommissions.reduce(
    (s, c) => s + c.comision_setter,
    0
  );
  const totalEgresos =
    totalGastosOp + totalComisionesClosers + totalComisionesSetters;

  const resultadoNeto = totalIngresos - totalEgresos;
  const esPositivo = resultadoNeto >= 0;

  // ────── GASTOS BY CATEGORY ──────
  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of monthGastos) {
      const cat = g.categoria || "Sin categoria";
      map.set(cat, (map.get(cat) || 0) + (g.monto_usd || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [monthGastos]);

  // ────── CASH FLOW: Quien gasto / Quien recibio ──────
  const gastosPorPersona = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const g of monthGastos) {
      const persona = g.pagado_por?.trim() || g.pagado_a?.trim() || "Sin asignar";
      if (!map.has(persona)) map.set(persona, { count: 0, total: 0 });
      const p = map.get(persona)!;
      p.count++;
      p.total += g.monto_usd || 0;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [monthGastos]);

  const monthPayments = useMemo(() => {
    return payments.filter((p) => {
      if (!p.fecha_pago) return false;
      return getFiscalMonth(parseLocalDate(p.fecha_pago)) === currentLabel;
    });
  }, [payments, currentLabel]);

  const ingresosPorReceptor = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const p of monthPayments) {
      if (p.monto_usd <= 0) continue;
      const receptor = p.receptor?.trim() || "Sin asignar";
      if (!map.has(receptor)) map.set(receptor, { count: 0, total: 0 });
      const r = map.get(receptor)!;
      r.count++;
      r.total += p.monto_usd;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [monthPayments]);

  // ────── TREASURY ──────
  const filteredTreasury = useMemo(
    () => treasury.filter((r) => r.mes_fiscal === currentLabel),
    [treasury, currentLabel]
  );

  const byReceptor = useMemo(() => {
    const map: Record<string, { total_usd: number; total_ars: number }> = {};
    for (const r of filteredTreasury) {
      if (!map[r.receptor])
        map[r.receptor] = { total_usd: 0, total_ars: 0 };
      map[r.receptor].total_usd += r.total_usd ?? 0;
      map[r.receptor].total_ars += r.total_ars ?? 0;
    }
    return Object.entries(map)
      .map(([receptor, totals]) => ({ receptor, ...totals }))
      .sort((a, b) => b.total_usd - a.total_usd);
  }, [filteredTreasury]);

  const grandTotalUSD = byReceptor.reduce((s, r) => s + r.total_usd, 0);
  const grandTotalARS = byReceptor.reduce((s, r) => s + r.total_ars, 0);

  // ────── MONTHLY CHART ──────
  const chartData = useMemo(() => {
    const months = getFiscalMonthOptions(6).reverse();
    return months.map((m) => {
      const mc = monthlyCash.find((c) => c.mes_fiscal === m.label);
      const gast = localGastos
        .filter((g) => gastoFiscalMonth(g.fecha) === m.label)
        .reduce((s, g) => s + (g.monto_usd || 0), 0);
      return {
        mes: m.label,
        Ingresos: mc ? mc.cash_ventas_nuevas + mc.cash_cuotas + mc.cash_renovaciones : 0,
        Gastos: gast,
      };
    });
  }, [monthlyCash, localGastos]);

  // ────── FORM SUBMIT ──────
  async function handleSubmitGasto(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...gastoForm,
          monto_usd: parseFloat(gastoForm.monto_usd) || 0,
          monto_ars: parseFloat(gastoForm.monto_ars) || 0,
        }),
      });
      const data = await res.json();
      if (data.ok && data.gasto) {
        setLocalGastos((prev) => [data.gasto, ...prev]);
        setShowGastoForm(false);
        setGastoForm({
          fecha: new Date().toISOString().split("T")[0],
          concepto: "",
          categoria: "",
          monto_usd: "",
          monto_ars: "",
          billetera: "",
          pagado_a: "",
          pagado_por: "",
          estado: "pagado",
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Finanzas</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Estado de resultados, gastos y tesoreria &mdash; {currentLabel}
          </p>
        </div>
        <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* ══════════════ P&L ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">
          Estado de Resultados
        </h2>

        {/* Ingresos */}
        <p className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Ingresos
        </p>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Cash Collected (ventas nuevas)</span>
            <span className="text-white">{formatUSD(cashVentasNuevas)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Cash Collected (cuotas)</span>
            <span className="text-white">{formatUSD(cashCuotas)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Cash Collected (renovaciones)</span>
            <span className="text-white">{formatUSD(cashRenovaciones)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-[var(--green)]">
            <span>Total Ingresos</span>
            <span>{formatUSD(totalIngresos)}</span>
          </div>
        </div>

        {/* Egresos */}
        <p className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Egresos
        </p>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Gastos Operativos</span>
            <span className="text-white">{formatUSD(totalGastosOp)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Comisiones Closers</span>
            <span className="text-white">{formatUSD(totalComisionesClosers)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Comisiones Setters</span>
            <span className="text-white">{formatUSD(totalComisionesSetters)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-[var(--red)]">
            <span>Total Egresos</span>
            <span>{formatUSD(totalEgresos)}</span>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-[var(--card-border)] my-4" />

        {/* Resultado Neto */}
        <div
          className={`flex justify-between text-2xl font-bold ${
            esPositivo ? "text-[var(--green)]" : "text-[var(--red)]"
          }`}
        >
          <span>Resultado Neto</span>
          <span>{formatUSD(resultadoNeto)}</span>
        </div>
      </div>

      {/* ══════════════ COMISIONES POR EMPLEADO ══════════════ */}
      {monthCommissions.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">
            Comisiones por Empleado
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {monthCommissions.map((c) => (
              <div
                key={c.team_member_id}
                className="flex items-center justify-between bg-white/5 rounded-lg p-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">{c.nombre}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Closer: {formatUSD(c.comision_closer)} &middot; Setter:{" "}
                    {formatUSD(c.comision_setter)}
                  </p>
                </div>
                <p className="text-sm font-bold text-[var(--green)]">
                  {formatUSD(c.comision_total)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-bold pt-3 border-t border-[var(--card-border)]">
            <span className="text-[var(--muted)]">Total Comisiones</span>
            <span className="text-[var(--purple-light)]">
              {formatUSD(totalComisionesClosers + totalComisionesSetters)}
            </span>
          </div>
        </div>
      )}

      {/* ══════════════ CASH FLOW ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quien gasto */}
        {gastosPorPersona.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">
              Quien gasto
            </h2>
            <div className="space-y-3">
              {gastosPorPersona.map(([persona, data]) => (
                <div
                  key={persona}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 flex items-center justify-center text-xs font-bold text-[var(--red)]">
                      {persona.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {persona}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {data.count} gasto{data.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[var(--red)]">
                    {formatUSD(data.total)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold pt-3 mt-3 border-t border-[var(--card-border)]">
              <span className="text-[var(--muted)]">Total</span>
              <span className="text-[var(--red)]">
                {formatUSD(
                  gastosPorPersona.reduce((s, [, d]) => s + d.total, 0)
                )}
              </span>
            </div>
          </div>
        )}

        {/* Quien recibio */}
        {ingresosPorReceptor.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">
              Quien recibio
            </h2>
            <div className="space-y-3">
              {ingresosPorReceptor.map(([receptor, data]) => (
                <div
                  key={receptor}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--green)]/10 flex items-center justify-center text-xs font-bold text-[var(--green)]">
                      {receptor.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {receptor}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {data.count} pago{data.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[var(--green)]">
                    {formatUSD(data.total)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold pt-3 mt-3 border-t border-[var(--card-border)]">
              <span className="text-[var(--muted)]">Total</span>
              <span className="text-[var(--green)]">
                {formatUSD(
                  ingresosPorReceptor.reduce((s, [, d]) => s + d.total, 0)
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ TESORERIA ══════════════ */}
      {byReceptor.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Tesoreria &mdash; Donde esta la plata
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
            {byReceptor.map((r) => (
              <div
                key={r.receptor}
                className="bg-white/5 border border-[var(--card-border)] rounded-lg p-4"
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
          <div className="flex gap-4">
            <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl px-6 py-4">
              <p className="text-xs text-[var(--muted)] uppercase">Total USD</p>
              <p className="text-2xl font-bold text-[var(--green)]">
                {formatUSD(grandTotalUSD)}
              </p>
            </div>
            {grandTotalARS > 0 && (
              <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl px-6 py-4">
                <p className="text-xs text-[var(--muted)] uppercase">
                  Total ARS
                </p>
                <p className="text-2xl font-bold text-[var(--green)]">
                  {formatARS(grandTotalARS)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ GASTOS POR CATEGORIA ══════════════ */}
      {byCat.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">
            Gastos por Categoria
          </h2>
          <div className="space-y-2">
            {byCat.map(([cat, monto]) => {
              const pct =
                totalGastosOp > 0
                  ? ((monto / totalGastosOp) * 100).toFixed(0)
                  : "0";
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/80">{cat}</span>
                    <span className="font-medium text-[var(--red)]">
                      {formatUSD(monto)}{" "}
                      <span className="text-[var(--muted)] text-xs">
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5">
                    <div
                      className="h-full bg-[var(--red)] rounded-full"
                      style={{
                        width: `${totalGastosOp > 0 ? (monto / totalGastosOp) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════ GASTOS TABLE ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Gastos del Mes ({monthGastos.length})
          </h2>
          <button
            onClick={() => setShowGastoForm(!showGastoForm)}
            className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm font-medium hover:bg-[var(--purple-light)] transition-colors"
          >
            {showGastoForm ? "Cancelar" : "+ Cargar Gasto"}
          </button>
        </div>

        {/* Inline form */}
        {showGastoForm && (
          <form
            onSubmit={handleSubmitGasto}
            className="px-6 py-4 border-b border-[var(--card-border)] bg-white/5"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input
                type="date"
                value={gastoForm.fecha}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, fecha: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
                required
              />
              <input
                placeholder="Concepto *"
                value={gastoForm.concepto}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, concepto: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
                required
              />
              <input
                placeholder="Categoria"
                value={gastoForm.categoria}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, categoria: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Monto USD"
                type="number"
                step="0.01"
                value={gastoForm.monto_usd}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, monto_usd: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Monto ARS"
                type="number"
                step="0.01"
                value={gastoForm.monto_ars}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, monto_ars: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Billetera"
                value={gastoForm.billetera}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, billetera: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Pagado a"
                value={gastoForm.pagado_a}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, pagado_a: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Pagado por"
                value={gastoForm.pagado_por}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, pagado_por: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <select
                value={gastoForm.estado}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, estado: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              >
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 rounded-lg bg-[var(--green)] text-white text-sm font-medium hover:bg-[var(--green)]/80 transition-colors disabled:opacity-50"
              >
                {submitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        )}

        {monthGastos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase border-b border-[var(--card-border)]">
                  <th className="text-left py-3 px-4">Fecha</th>
                  <th className="text-left py-3 px-4">Concepto</th>
                  <th className="text-left py-3 px-4">Categoria</th>
                  <th className="text-left py-3 px-4">Billetera</th>
                  <th className="text-left py-3 px-4">Pagado a</th>
                  <th className="text-left py-3 px-4">Estado</th>
                  <th className="text-right py-3 px-4">Monto</th>
                </tr>
              </thead>
              <tbody>
                {monthGastos.map((g) => (
                  <tr
                    key={g.id}
                    className="border-t border-[var(--card-border)]/30 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-4 text-[var(--muted)]">
                      {g.fecha || "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-white font-medium">
                      {g.concepto || "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-[var(--muted)]">
                      {g.categoria || "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-[var(--muted)]">
                      {g.billetera || "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-[var(--muted)]">
                      {g.pagado_a || "\u2014"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          g.estado === "pagado"
                            ? "bg-[var(--green)]/20 text-[var(--green)]"
                            : "bg-[var(--yellow)]/20 text-[var(--yellow)]"
                        }`}
                      >
                        {g.estado || "pendiente"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-[var(--red)]">
                      {g.monto_usd > 0 && formatUSD(g.monto_usd)}
                      {g.monto_usd > 0 && g.monto_ars > 0 && " / "}
                      {g.monto_ars > 0 && formatARS(g.monto_ars)}
                      {!g.monto_usd && !g.monto_ars && "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-[var(--muted)] text-sm">
            Sin gastos para este periodo
          </div>
        )}
      </div>

      {/* ══════════════ MONTHLY CHART ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Ingresos vs Gastos (ultimos 6 meses)
        </h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--card-border)"
            />
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
              formatter={(value) => [formatUSD(Number(value)), ""]}
            />
            <Legend />
            <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
