"use client";

import { useMemo } from "react";
import KPICard from "@/app/components/KPICard";
import { formatUSD } from "@/lib/format";
import { getFiscalStart, getFiscalEnd, parseLocalDate } from "@/lib/date-utils";
import { COMMISSION_SETTER } from "@/lib/constants";
import type { Lead, DailyReport } from "@/lib/types";

export interface ObjectiveData {
  id: string;
  team_member_id: string;
  mes_fiscal: string;
  objetivo_cash: number;
  objetivo_cierres: number;
  objetivo_agendas: number;
}

interface Props {
  reports: DailyReport[];
  leads: Lead[];
  currentMemberId: string;
  currentName: string;
  objective?: ObjectiveData | null;
}

export default function HomeSetter({
  reports,
  leads,
  currentMemberId,
  currentName,
  objective,
}: Props) {
  const fiscalStart = getFiscalStart();
  const fiscalEnd = getFiscalEnd();
  const today = new Date().toISOString().split("T")[0];

  // Today's report
  const todayReport = useMemo(() => {
    return reports.find((r) => r.fecha === today);
  }, [reports, today]);

  // Agendas generadas hoy
  const agendasHoy = useMemo(() => {
    return leads.filter((l) => {
      if (!l.fecha_agendado) return false;
      return l.fecha_agendado.split("T")[0] === today;
    }).length;
  }, [leads, today]);

  // Agendas generadas este mes (leads where setter_id = me, fecha_agendado in fiscal range)
  const agendasMes = useMemo(() => {
    return leads.filter((l) => {
      if (!l.fecha_agendado) return false;
      const d = parseLocalDate(l.fecha_agendado);
      return d >= fiscalStart && d <= fiscalEnd;
    }).length;
  }, [leads, fiscalStart, fiscalEnd]);

  // Ventas por chat — from daily_reports in fiscal range
  const ventasChat = useMemo(() => {
    return reports
      .filter((r) => {
        const d = parseLocalDate(r.fecha);
        return d >= fiscalStart && d <= fiscalEnd;
      })
      .reduce((count, r) => {
        if (r.ventas_por_chat && r.ventas_por_chat.trim().length > 0) {
          return count + 1;
        }
        return count;
      }, 0);
  }, [reports, fiscalStart, fiscalEnd]);

  // Comisiones — 5% of cash from cerrado leads where setter = me
  const comisiones = useMemo(() => {
    const cerrados = leads.filter((l) => {
      if ((l.estado !== "cerrado" && l.estado !== "adentro_seguimiento") || !l.fecha_llamada) return false;
      const d = parseLocalDate(l.fecha_llamada);
      return d >= fiscalStart && d <= fiscalEnd;
    });
    const cash = cerrados.reduce((s, l) => s + l.ticket_total, 0);
    return cash * COMMISSION_SETTER;
  }, [leads, fiscalStart, fiscalEnd]);

  // Conversaciones totales (from reports in fiscal range)
  const conversaciones = useMemo(() => {
    return reports
      .filter((r) => {
        const d = parseLocalDate(r.fecha);
        return d >= fiscalStart && d <= fiscalEnd;
      })
      .reduce((s, r) => s + r.conversaciones_iniciadas, 0);
  }, [reports, fiscalStart, fiscalEnd]);

  // Today's auto-calculated metrics
  const todayConversaciones = todayReport?.conversaciones_iniciadas ?? 0;
  const todayCalendarios = todayReport?.calendarios_enviados ?? 0;
  const todayVentasChat = todayReport?.ventas_por_chat ? 1 : 0;

  // Objective target for agendas
  const objetivoAgendas = objective?.objetivo_agendas ?? 5;

  // Last 7 reports for quick view
  const recentReports = reports.slice(0, 7);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Hola, {currentName}
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Tu resumen del mes
        </p>
      </div>

      {/* Live Counter — Hoy agendaste X / objetivo Y */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Hoy</h2>
          <span className="text-sm text-[var(--muted)]">
            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" })}
          </span>
        </div>

        {/* Agendas progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-[var(--foreground)] font-medium">
              Hoy agendaste <span className="text-[var(--purple-light)] font-bold">{agendasHoy}</span> &mdash; objetivo: <span className="font-bold">{Math.ceil(objetivoAgendas / 22)}</span>
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              agendasHoy >= Math.ceil(objetivoAgendas / 22)
                ? "bg-green-500/15 text-green-400"
                : agendasHoy > 0
                ? "bg-yellow-500/15 text-yellow-400"
                : "bg-white/5 text-[var(--muted)]"
            }`}>
              {agendasHoy >= Math.ceil(objetivoAgendas / 22) ? "Objetivo cumplido" : agendasHoy > 0 ? "En progreso" : "Sin agendas"}
            </span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                agendasHoy >= Math.ceil(objetivoAgendas / 22) ? "bg-[var(--green)]" : "bg-[var(--purple)]"
              }`}
              style={{ width: `${Math.min((agendasHoy / Math.max(Math.ceil(objetivoAgendas / 22), 1)) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Today's metrics in a row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--foreground)]">{todayConversaciones}</p>
            <p className="text-xs text-[var(--muted)]">Conversaciones</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--foreground)]">{todayCalendarios}</p>
            <p className="text-xs text-[var(--muted)]">Calendarios</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--foreground)]">{todayVentasChat}</p>
            <p className="text-xs text-[var(--muted)]">Ventas chat</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Agendas Generadas"
          value={agendasMes}
          format="number"
          icon={"\u{1F4C5}"}
        />
        <KPICard
          label="Ventas por Chat"
          value={ventasChat}
          format="number"
          icon={"\u{1F4AC}"}
        />
        <KPICard
          label="Comisiones"
          value={comisiones}
          format="usd"
          icon={"\u{1F4B5}"}
        />
        <KPICard
          label="Conversaciones"
          value={conversaciones}
          format="number"
          icon={"\u{1F5E3}\u{FE0F}"}
        />
      </div>

      {/* Tu objetivo del mes */}
      {objective && objective.objetivo_agendas > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Tu Objetivo del Mes</h2>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-[var(--muted)]">Agendas</span>
                <span className="text-white font-medium">
                  {agendasMes} / {objective.objetivo_agendas} ({objective.objetivo_agendas > 0 ? ((agendasMes / objective.objetivo_agendas) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    agendasMes >= objective.objetivo_agendas ? "bg-[var(--green)]" : agendasMes >= objective.objetivo_agendas * 0.7 ? "bg-[var(--yellow)]" : "bg-[var(--purple)]"
                  }`}
                  style={{ width: `${Math.min((agendasMes / objective.objetivo_agendas) * 100, 100)}%` }}
                />
              </div>
            </div>
            {objective.objetivo_cash > 0 && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[var(--muted)]">Cash (comisiones)</span>
                  <span className="text-white font-medium">
                    {formatUSD(comisiones)} / {formatUSD(objective.objetivo_cash)} ({objective.objetivo_cash > 0 ? ((comisiones / objective.objetivo_cash) * 100).toFixed(0) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      comisiones >= objective.objetivo_cash ? "bg-[var(--green)]" : "bg-[var(--purple)]"
                    }`}
                    style={{ width: `${Math.min((comisiones / objective.objetivo_cash) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Access */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a
          href="/form/venta-chat"
          className="bg-[var(--purple)]/10 border border-[var(--purple)]/20 rounded-xl p-5 hover:bg-[var(--purple)]/15 transition-colors"
        >
          <span className="text-2xl mb-2 block">{"\u{1F4AC}"}</span>
          <h3 className="text-base font-semibold text-white">Venta por Chat</h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Registrar venta directa
          </p>
        </a>
        <a
          href="/form/reporte-setter"
          className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl p-5 hover:bg-[var(--green)]/15 transition-colors"
        >
          <span className="text-2xl mb-2 block">{"\u{1F4DD}"}</span>
          <h3 className="text-base font-semibold text-white">Reporte Diario</h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Cargar actividad del dia
          </p>
        </a>
        <a
          href="/calendario"
          className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 hover:bg-blue-500/15 transition-colors"
        >
          <span className="text-2xl mb-2 block">{"\u{1F4C5}"}</span>
          <h3 className="text-base font-semibold text-white">Calendario</h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Ver agendas y leads
          </p>
        </a>
      </div>

      {/* Recent Reports */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Ultimos Reportes
        </h2>
        {recentReports.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-4 text-center">
            Sin reportes cargados
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase">
                  <th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-right py-2 px-3">Conversaciones</th>
                  <th className="text-right py-2 px-3">Historias</th>
                  <th className="text-right py-2 px-3">Calendarios</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--card-border)]"
                  >
                    <td className="py-2 px-3 text-white">
                      {parseLocalDate(r.fecha).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.conversaciones_iniciadas}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.respuestas_historias}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.calendarios_enviados}
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
