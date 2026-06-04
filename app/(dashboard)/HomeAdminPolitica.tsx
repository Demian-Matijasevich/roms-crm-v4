"use client";

/**
 * Dashboard simplificado para vista política con 3 secciones tab:
 *   - Ventas (pipeline + ventas mes + tickets)
 *   - Finanzas (cash collected + comisiones + cuotas pendientes)
 *   - Clientes (activos + at risk + renovaciones)
 *
 * Tomado del pedido del audio del equipo política:
 *   "Si el dashboard tiene que tener tres cosas claras: finanzas, clientes y ventas."
 */
import { useState, useMemo } from "react";
import KPICard from "@/app/components/KPICard";
import { formatUSD } from "@/lib/format";
import { getFiscalMonth, getToday } from "@/lib/date-utils";
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
  ventasFirmadasOverride?: number;
}

type Tab = "ventas" | "finanzas" | "clientes";

export default function HomeAdminPolitica({
  monthlyCash,
  payments,
  overduePayments,
  atRiskClients,
  commissions,
  teamCommissions,
  revPrediction,
  ventasFirmadasOverride,
}: Props) {
  const [tab, setTab] = useState<Tab>("ventas");

  const currentLabel = useMemo(() => getFiscalMonth(getToday()), []);
  const current = useMemo(() => monthlyCash.find((m) => m.mes_fiscal === currentLabel), [monthlyCash, currentLabel]);

  const facturacion = ventasFirmadasOverride !== undefined ? ventasFirmadasOverride : (current?.facturacion ?? 0);
  const cashTotal = current?.cash_total ?? 0;
  const cashVentasNuevas = current?.cash_ventas_nuevas ?? 0;
  const cashCuotas = current?.cash_cuotas ?? 0;
  const ventasNuevasCount = current?.ventas_nuevas_count ?? 0;
  const refunds = current?.refunds ?? 0;
  const ticketPromedio = ventasNuevasCount > 0 ? facturacion / ventasNuevasCount : 0;

  const cuotasPendientes = revPrediction.cuotasPendientes;
  const pipelineTotal = revPrediction.pipelineTotal;
  const pipelineCount = revPrediction.pipelineCount;
  const cuotasVencidas = overduePayments.reduce((s, p) => s + (p.monto_usd || 0), 0);

  const totalComisionesMes = teamCommissions.reduce((s, c) => s + c.comision_total, 0);

  // void unused
  void payments;
  void commissions;

  const tabClass = (t: Tab) => `px-4 py-2 text-sm rounded-lg transition-all ${tab === t ? "bg-[var(--purple)]/20 border border-[var(--purple)]/40 text-[var(--purple)]" : "border border-transparent text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"}`;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏛 ROMS Política</h1>
          <p className="text-sm text-[var(--muted)]">{currentLabel}</p>
        </div>
        <div className="flex gap-2">
          <button className={tabClass("ventas")} onClick={() => setTab("ventas")}>🎯 Ventas</button>
          <button className={tabClass("finanzas")} onClick={() => setTab("finanzas")}>💰 Finanzas</button>
          <button className={tabClass("clientes")} onClick={() => setTab("clientes")}>👥 Clientes</button>
        </div>
      </div>

      {tab === "ventas" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Ventas firmadas" value={facturacion} format="usd" />
            <KPICard label="Ventas nuevas" value={ventasNuevasCount} />
            <KPICard label="Ticket promedio" value={ticketPromedio} format="usd" />
            <KPICard label="Pipeline en juego" value={pipelineTotal} format="usd" />
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">Pipeline</h3>
            <p className="text-3xl font-bold">{pipelineCount}</p>
            <p className="text-xs text-[var(--muted)] mt-1">leads en seguimiento / pendientes / reserva</p>
            <a href="/pipeline" className="text-xs text-[var(--purple)] hover:underline mt-2 inline-block">Abrir kanban política →</a>
          </div>
        </div>
      )}

      {tab === "finanzas" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Cash mes" value={cashTotal} format="usd" />
            <KPICard label="Cuotas pendientes" value={cuotasPendientes} format="usd" />
            <KPICard label="Cuotas vencidas" value={cuotasVencidas} format="usd" valueClassName="text-[var(--red)]" />
            <KPICard label="Refunds mes" value={refunds} format="usd" valueClassName="text-[var(--red)]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Breakdown cash mes</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[var(--muted)]">Ventas nuevas</span><span className="font-mono">{formatUSD(cashVentasNuevas)}</span></div>
                <div className="flex justify-between"><span className="text-[var(--muted)]">Cuotas</span><span className="font-mono">{formatUSD(cashCuotas)}</span></div>
                <div className="flex justify-between border-t border-[var(--card-border)] pt-2 mt-2 font-semibold"><span>Total</span><span className="font-mono">{formatUSD(cashTotal)}</span></div>
              </div>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Comisiones del equipo</h3>
              {teamCommissions.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">Sin comisiones cargadas este mes</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {teamCommissions.map((c) => (
                    <div key={c.id} className="flex justify-between">
                      <span className="text-[var(--muted)]">{c.nombre}</span>
                      <span className="font-mono">{formatUSD(c.comision_total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-[var(--card-border)] pt-2 mt-2 font-semibold">
                    <span>Total</span>
                    <span className="font-mono">{formatUSD(totalComisionesMes)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            <a href="/comisiones" className="text-[var(--purple)] hover:underline">Detalle comisiones →</a>
            <span className="text-[var(--muted)]">·</span>
            <a href="/finanzas" className="text-[var(--purple)] hover:underline">Finanzas detalle →</a>
            <span className="text-[var(--muted)]">·</span>
            <a href="/tesoreria" className="text-[var(--purple)] hover:underline">Tesorería →</a>
          </div>
        </div>
      )}

      {tab === "clientes" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard label="Clientes activos" value={atRiskClients.length + (current?.ventas_nuevas_count ?? 0)} />
            <KPICard label="En riesgo (health < 50)" value={atRiskClients.length} valueClassName="text-amber-400" />
            <KPICard label="Renovaciones próximas" value={revPrediction.renewalCount} />
            <KPICard label="Pendientes vencidos" value={overduePayments.length} valueClassName="text-[var(--red)]" />
          </div>

          {atRiskClients.length > 0 && (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">Clientes en riesgo</h3>
              <div className="space-y-1 text-sm max-h-72 overflow-y-auto">
                {atRiskClients.slice(0, 20).map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-[var(--card-border)] last:border-0">
                    <div className="truncate">
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-xs text-[var(--muted)] ml-2">{c.programa || "—"}</span>
                    </div>
                    <span className="text-xs font-mono text-amber-400">{c.health_score}/100</span>
                  </div>
                ))}
                {atRiskClients.length > 20 && (
                  <p className="text-xs text-[var(--muted)] pt-2">+ {atRiskClients.length - 20} más</p>
                )}
              </div>
              <a href="/seguimiento" className="text-xs text-[var(--purple)] hover:underline mt-2 inline-block">Abrir seguimiento →</a>
            </div>
          )}

          <div className="flex gap-2 text-xs">
            <a href="/clientes" className="text-[var(--purple)] hover:underline">Todos los clientes →</a>
            <span className="text-[var(--muted)]">·</span>
            <a href="/renovaciones" className="text-[var(--purple)] hover:underline">Cola de renovaciones →</a>
            <span className="text-[var(--muted)]">·</span>
            <a href="/tracker" className="text-[var(--purple)] hover:underline">Tracker 1a1 →</a>
          </div>
        </div>
      )}
    </div>
  );
}
