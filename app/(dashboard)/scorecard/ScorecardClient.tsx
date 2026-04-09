"use client";

import { useMemo } from "react";
import { formatUSD, formatPctRaw } from "@/lib/format";
import { parseLocalDate } from "@/lib/date-utils";
import type { Lead, Payment, TeamMember } from "@/lib/types";

interface Props {
  leads: Lead[];
  payments: Payment[];
  team: TeamMember[];
  lastMondayStr: string;
  twoWeeksAgoMondayStr: string;
  thisMondayStr: string;
}

interface WeekData {
  ventasCerradasCount: number;
  ventasCerradasCash: number;
  cuotasCobradasCount: number;
  cuotasCobradasCash: number;
  leadsGenerados: number;
  showUpRate: number;
  cierreRate: number;
  cashCollectedTotal: number;
  presentados: number;
  totalAgendas: number;
}

function computeWeek(
  leads: Lead[],
  payments: Payment[],
  startStr: string,
  endStr: string
): WeekData {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);

  const weekLeads = leads.filter((l) => {
    if (!l.fecha_llamada) return false;
    const d = parseLocalDate(l.fecha_llamada.split("T")[0]);
    return d >= start && d < end;
  });

  const weekPayments = payments.filter((p) => {
    if (!p.fecha_pago) return false;
    const d = parseLocalDate(p.fecha_pago.split("T")[0]);
    return d >= start && d < end;
  });

  const cerrados = weekLeads.filter((l) => l.estado === "cerrado");
  const ventasCerradasCount = cerrados.length;
  const ventasCerradasCash = cerrados.reduce((s, l) => s + l.ticket_total, 0);

  const cuotaPayments = weekPayments.filter(
    (p) => p.estado === "pagado" && p.numero_cuota > 1
  );
  const cuotasCobradasCount = cuotaPayments.length;
  const cuotasCobradasCash = cuotaPayments.reduce((s, p) => s + p.monto_usd, 0);

  const leadsGenerados = weekLeads.length;
  const presentados = weekLeads.filter(
    (l) =>
      l.estado !== "pendiente" &&
      l.estado !== "no_show" &&
      l.estado !== "cancelada"
  ).length;

  const showUpRate = leadsGenerados > 0 ? (presentados / leadsGenerados) * 100 : 0;
  const cierreRate = presentados > 0 ? (ventasCerradasCount / presentados) * 100 : 0;

  const allPaidPayments = weekPayments.filter((p) => p.estado === "pagado");
  const cashCollectedTotal = allPaidPayments.reduce((s, p) => s + p.monto_usd, 0);

  return {
    ventasCerradasCount,
    ventasCerradasCash,
    cuotasCobradasCount,
    cuotasCobradasCash,
    leadsGenerados,
    showUpRate,
    cierreRate,
    cashCollectedTotal,
    presentados,
    totalAgendas: leadsGenerados,
  };
}

function delta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export default function ScorecardClient({
  leads,
  payments,
  team,
  lastMondayStr,
  twoWeeksAgoMondayStr,
  thisMondayStr,
}: Props) {
  const lastWeek = useMemo(
    () => computeWeek(leads, payments, lastMondayStr, thisMondayStr),
    [leads, payments, lastMondayStr, thisMondayStr]
  );

  const prevWeek = useMemo(
    () => computeWeek(leads, payments, twoWeeksAgoMondayStr, lastMondayStr),
    [leads, payments, twoWeeksAgoMondayStr, lastMondayStr]
  );

  // Per-closer breakdown
  const closerBreakdown = useMemo(() => {
    const start = parseLocalDate(lastMondayStr);
    const end = parseLocalDate(thisMondayStr);

    const weekLeads = leads.filter((l) => {
      if (!l.fecha_llamada) return false;
      const d = parseLocalDate(l.fecha_llamada.split("T")[0]);
      return d >= start && d < end;
    });

    const closers = team.filter((t) => t.is_closer);
    return closers
      .map((c) => {
        const myLeads = weekLeads.filter((l) => l.closer_id === c.id);
        const cerrados = myLeads.filter((l) => l.estado === "cerrado");
        const presentados = myLeads.filter(
          (l) =>
            l.estado !== "pendiente" &&
            l.estado !== "no_show" &&
            l.estado !== "cancelada"
        );
        const cash = cerrados.reduce((s, l) => s + l.ticket_total, 0);
        const tasaCierre =
          presentados.length > 0
            ? (cerrados.length / presentados.length) * 100
            : 0;
        const aov = cerrados.length > 0 ? cash / cerrados.length : 0;

        return {
          nombre: c.nombre,
          cierres: cerrados.length,
          cash,
          tasaCierre,
          aov,
        };
      })
      .filter((c) => c.cierres > 0 || c.cash > 0)
      .sort((a, b) => b.cash - a.cash);
  }, [leads, team, lastMondayStr, thisMondayStr]);

  // Per-setter breakdown
  const setterBreakdown = useMemo(() => {
    const start = parseLocalDate(lastMondayStr);
    const end = parseLocalDate(thisMondayStr);

    const weekLeads = leads.filter((l) => {
      if (!l.fecha_agendado && !l.fecha_llamada) return false;
      const dateStr = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
      const d = parseLocalDate(dateStr);
      return d >= start && d < end;
    });

    const setters = team.filter((t) => t.is_setter);
    return setters
      .map((s) => {
        const myLeads = weekLeads.filter((l) => l.setter_id === s.id);
        const agendas = myLeads.length;
        const ventasChat = 0; // Would need daily_reports — show agendas only

        return {
          nombre: s.nombre,
          agendas,
          ventasChat,
        };
      })
      .filter((s) => s.agendas > 0)
      .sort((a, b) => b.agendas - a.agendas);
  }, [leads, team, lastMondayStr, thisMondayStr]);

  // Highlights
  const highlights = useMemo(() => {
    const start = parseLocalDate(lastMondayStr);
    const end = parseLocalDate(thisMondayStr);

    const weekPayments = payments.filter((p) => {
      if (!p.fecha_pago || p.estado !== "pagado") return false;
      const d = parseLocalDate(p.fecha_pago.split("T")[0]);
      return d >= start && d < end;
    });

    // Best day
    const dayMap = new Map<string, number>();
    const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    for (const p of weekPayments) {
      const dateStr = p.fecha_pago!.split("T")[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + p.monto_usd);
    }
    let bestDay = "";
    let bestDayCash = 0;
    for (const [dateStr, cash] of dayMap) {
      if (cash > bestDayCash) {
        bestDayCash = cash;
        const d = parseLocalDate(dateStr);
        bestDay = dayNames[d.getDay()];
      }
    }

    // Top closer
    const topCloser = closerBreakdown.length > 0 ? closerBreakdown[0] : null;

    // Cuotas cobradas
    const cuotaPayments = weekPayments.filter((p) => p.numero_cuota > 1);
    const totalCuotas = weekPayments.filter((p) => p.numero_cuota > 1 || p.estado === "pendiente").length;
    const cuotasCobradas = cuotaPayments.length;

    return { bestDay, bestDayCash, topCloser, cuotasCobradas, totalCuotas };
  }, [payments, lastMondayStr, thisMondayStr, closerBreakdown]);

  const formatWeekRange = (startStr: string) => {
    const s = parseLocalDate(startStr);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    return `${s.toLocaleDateString("es-AR", opts)} - ${e.toLocaleDateString("es-AR", opts)}`;
  };

  function DeltaBadge({ current, previous }: { current: number; previous: number }) {
    const d = delta(current, previous);
    if (d === null) return null;
    const positive = d >= 0;
    return (
      <span className={`text-xs ml-2 ${positive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
        {positive ? "\u25B2" : "\u25BC"} {Math.abs(d).toFixed(0)}%
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Scorecard Semanal</h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          {formatWeekRange(lastMondayStr)} vs {formatWeekRange(twoWeeksAgoMondayStr)}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <span className="text-xs text-[var(--muted)] uppercase">Ventas Cerradas</span>
          <p className="text-2xl font-bold text-white mt-1">
            {lastWeek.ventasCerradasCount}
            <DeltaBadge current={lastWeek.ventasCerradasCount} previous={prevWeek.ventasCerradasCount} />
          </p>
          <p className="text-sm text-[var(--green)] font-medium">
            {formatUSD(lastWeek.ventasCerradasCash)}
            <DeltaBadge current={lastWeek.ventasCerradasCash} previous={prevWeek.ventasCerradasCash} />
          </p>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <span className="text-xs text-[var(--muted)] uppercase">Cuotas Cobradas</span>
          <p className="text-2xl font-bold text-white mt-1">
            {lastWeek.cuotasCobradasCount}
            <DeltaBadge current={lastWeek.cuotasCobradasCount} previous={prevWeek.cuotasCobradasCount} />
          </p>
          <p className="text-sm text-[var(--green)] font-medium">
            {formatUSD(lastWeek.cuotasCobradasCash)}
          </p>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <span className="text-xs text-[var(--muted)] uppercase">Leads Generados</span>
          <p className="text-2xl font-bold text-white mt-1">
            {lastWeek.leadsGenerados}
            <DeltaBadge current={lastWeek.leadsGenerados} previous={prevWeek.leadsGenerados} />
          </p>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <span className="text-xs text-[var(--muted)] uppercase">Show Up Rate</span>
          <p className="text-2xl font-bold text-white mt-1">
            {formatPctRaw(lastWeek.showUpRate)}
            <DeltaBadge current={lastWeek.showUpRate} previous={prevWeek.showUpRate} />
          </p>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <span className="text-xs text-[var(--muted)] uppercase">Cierre Rate</span>
          <p className="text-2xl font-bold text-white mt-1">
            {formatPctRaw(lastWeek.cierreRate)}
            <DeltaBadge current={lastWeek.cierreRate} previous={prevWeek.cierreRate} />
          </p>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <span className="text-xs text-[var(--muted)] uppercase">Cash Collected Total</span>
          <p className="text-2xl font-bold text-[var(--green)] mt-1">
            {formatUSD(lastWeek.cashCollectedTotal)}
            <DeltaBadge current={lastWeek.cashCollectedTotal} previous={prevWeek.cashCollectedTotal} />
          </p>
        </div>
      </div>

      {/* Highlights */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Highlights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {highlights.bestDay && (
            <div className="bg-[var(--purple)]/10 border border-[var(--purple)]/20 rounded-lg p-4">
              <p className="text-sm text-[var(--muted)]">Mejor dia</p>
              <p className="text-white font-bold text-lg">
                {highlights.bestDay} {formatUSD(highlights.bestDayCash)}
              </p>
            </div>
          )}
          {highlights.topCloser && (
            <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-lg p-4">
              <p className="text-sm text-[var(--muted)]">Top closer</p>
              <p className="text-white font-bold text-lg">
                {highlights.topCloser.nombre} ({formatUSD(highlights.topCloser.cash)})
              </p>
            </div>
          )}
          <div className="bg-[var(--yellow)]/10 border border-[var(--yellow)]/20 rounded-lg p-4">
            <p className="text-sm text-[var(--muted)]">Cuotas cobradas</p>
            <p className="text-white font-bold text-lg">
              {highlights.cuotasCobradas}
            </p>
          </div>
        </div>
      </div>

      {/* Per-Closer Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Breakdown por Closer</h2>
        {closerBreakdown.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-4 text-center">Sin datos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase">
                  <th className="text-left py-2 px-3">Closer</th>
                  <th className="text-right py-2 px-3">Cierres</th>
                  <th className="text-right py-2 px-3">Cash</th>
                  <th className="text-right py-2 px-3">Tasa Cierre</th>
                  <th className="text-right py-2 px-3">AOV</th>
                </tr>
              </thead>
              <tbody>
                {closerBreakdown.map((c) => (
                  <tr key={c.nombre} className="border-t border-[var(--card-border)]">
                    <td className="py-2 px-3 text-white font-medium">{c.nombre}</td>
                    <td className="py-2 px-3 text-right text-white">{c.cierres}</td>
                    <td className="py-2 px-3 text-right font-bold text-[var(--green)]">{formatUSD(c.cash)}</td>
                    <td className="py-2 px-3 text-right text-white">{formatPctRaw(c.tasaCierre)}</td>
                    <td className="py-2 px-3 text-right text-white">{formatUSD(c.aov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-Setter Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Breakdown por Setter</h2>
        {setterBreakdown.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-4 text-center">Sin datos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase">
                  <th className="text-left py-2 px-3">Setter</th>
                  <th className="text-right py-2 px-3">Agendas</th>
                  <th className="text-right py-2 px-3">Ventas Chat</th>
                </tr>
              </thead>
              <tbody>
                {setterBreakdown.map((s) => (
                  <tr key={s.nombre} className="border-t border-[var(--card-border)]">
                    <td className="py-2 px-3 text-white font-medium">{s.nombre}</td>
                    <td className="py-2 px-3 text-right text-white">{s.agendas}</td>
                    <td className="py-2 px-3 text-right text-white">{s.ventasChat}</td>
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
