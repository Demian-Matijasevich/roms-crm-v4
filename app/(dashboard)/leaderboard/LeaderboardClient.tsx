"use client";

import { useState, useMemo } from "react";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD, formatPct } from "@/lib/format";
import { getFiscalStart, getFiscalEnd, parseLocalDate } from "@/lib/date-utils";
import { getCloserRankings } from "@/lib/gamification";
import type { Lead, AtCommission } from "@/lib/types";
import type { CloserRanking } from "@/lib/gamification";

export interface ObjectiveData {
  id: string;
  team_member_id: string;
  mes_fiscal: string;
  objetivo_cash: number;
  objetivo_cierres: number;
  objetivo_agendas: number;
}

interface SetterStat {
  setterId: string;
  nombre: string;
  agendas: number;
  cerradas: number;
  tasa: number;
  cashDeLeads: number;
  comision: number;
}

interface Props {
  leads: Lead[];
  currentMemberId: string;
  commissions: AtCommission[];
  objectives?: ObjectiveData[];
}

function medal(pos: number): string {
  if (pos === 1) return "\u{1F947}";
  if (pos === 2) return "\u{1F948}";
  if (pos === 3) return "\u{1F949}";
  return `#${pos}`;
}

function borderStyle(pos: number): string {
  if (pos === 1)
    return "border-2 border-yellow-500/60 bg-yellow-500/5";
  if (pos === 2)
    return "border-2 border-gray-400/50 bg-gray-400/5";
  if (pos === 3)
    return "border-2 border-amber-700/50 bg-amber-700/5";
  return "border border-[var(--card-border)]";
}

export default function LeaderboardClient({
  leads,
  currentMemberId,
  commissions,
  objectives = [],
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );

  const rankings: CloserRanking[] = useMemo(() => {
    const d = parseLocalDate(selectedMonth);
    return getCloserRankings(leads, d);
  }, [leads, selectedMonth]);

  // Commission lookup by team member id
  const commMap = useMemo(() => {
    const map = new Map<string, AtCommission>();
    for (const c of commissions) map.set(c.id, c);
    return map;
  }, [commissions]);

  // Objectives lookup
  const objMap = useMemo(() => {
    const map = new Map<string, ObjectiveData>();
    for (const o of objectives) map.set(o.team_member_id, o);
    return map;
  }, [objectives]);

  // ────── #1 PER METRIC ──────
  const metricLeaders = useMemo(() => {
    if (rankings.length === 0) return null;

    const d = parseLocalDate(selectedMonth);
    const start = getFiscalStart(d);
    const end = getFiscalEnd(d);
    const fiscalLeads = leads.filter((l) => {
      if (!l.fecha_llamada) return false;
      const ld = new Date(l.fecha_llamada);
      return ld >= start && ld <= end;
    });
    const cerrados = fiscalLeads.filter(
      (l) =>
        l.estado === "cerrado" || l.estado === "adentro_seguimiento"
    );

    // Top Cash
    const topCash =
      rankings.length > 0 ? rankings[0] : null; // already sorted by cash

    // Top Cierre %
    const closerCierreMap = new Map<
      string,
      { nombre: string; presentadas: number; cerradas: number }
    >();
    for (const l of fiscalLeads) {
      if (!l.closer_id) continue;
      if (!closerCierreMap.has(l.closer_id)) {
        closerCierreMap.set(l.closer_id, {
          nombre: l.closer?.nombre ?? l.closer_id,
          presentadas: 0,
          cerradas: 0,
        });
      }
      const entry = closerCierreMap.get(l.closer_id)!;
      if (
        l.estado !== "cancelada" &&
        l.estado !== "no_show" &&
        l.estado !== "reprogramada"
      ) {
        entry.presentadas++;
      }
      if (
        l.estado === "cerrado" ||
        l.estado === "adentro_seguimiento"
      ) {
        entry.cerradas++;
      }
    }
    let topCierreName = "-";
    let topCierreValue = 0;
    for (const [, v] of closerCierreMap) {
      if (v.presentadas >= 3) {
        const pct = v.cerradas / v.presentadas;
        if (pct > topCierreValue) {
          topCierreValue = pct;
          topCierreName = v.nombre;
        }
      }
    }

    // Top Ticket
    let topTicketName = "-";
    let topTicketValue = 0;
    for (const l of cerrados) {
      if (l.ticket_total > topTicketValue) {
        topTicketValue = l.ticket_total;
        topTicketName = l.closer?.nombre ?? "-";
      }
    }

    // Velocidad (avg days from agendado to llamada for cerrados)
    const closerVelocities = new Map<
      string,
      { nombre: string; totalDays: number; count: number }
    >();
    for (const l of cerrados) {
      if (!l.closer_id || !l.fecha_agendado || !l.fecha_llamada)
        continue;
      if (!closerVelocities.has(l.closer_id)) {
        closerVelocities.set(l.closer_id, {
          nombre: l.closer?.nombre ?? l.closer_id,
          totalDays: 0,
          count: 0,
        });
      }
      const entry = closerVelocities.get(l.closer_id)!;
      const diff =
        Math.abs(
          new Date(l.fecha_llamada).getTime() -
            new Date(l.fecha_agendado).getTime()
        ) / 86400000;
      entry.totalDays += diff;
      entry.count++;
    }
    let topVelName = "-";
    let topVelValue = Infinity;
    for (const [, v] of closerVelocities) {
      const avg = v.count > 0 ? v.totalDays / v.count : Infinity;
      if (avg < topVelValue) {
        topVelValue = avg;
        topVelName = v.nombre;
      }
    }

    // Racha
    let topRachaName = "-";
    let topRachaValue = 0;
    for (const r of rankings) {
      if (r.streak > topRachaValue) {
        topRachaValue = r.streak;
        topRachaName = r.nombre;
      }
    }

    return [
      {
        label: "CASH",
        emoji: "\u{1F4B0}",
        name: topCash?.nombre ?? "-",
        value: topCash ? formatUSD(topCash.cash) : "-",
      },
      {
        label: "CIERRE %",
        emoji: "\u{1F3AF}",
        name: topCierreName,
        value: topCierreValue > 0 ? formatPct(topCierreValue) : "-",
      },
      {
        label: "TICKET",
        emoji: "\u{1F48E}",
        name: topTicketName,
        value: topTicketValue > 0 ? formatUSD(topTicketValue) : "-",
      },
      {
        label: "VELOCIDAD",
        emoji: "\u26A1",
        name: topVelName,
        value:
          topVelValue === Infinity
            ? "-"
            : `${topVelValue.toFixed(1)}d`,
      },
      {
        label: "RACHA",
        emoji: "\u{1F525}",
        name: topRachaName,
        value:
          topRachaValue > 0 ? `${topRachaValue} dias` : "-",
      },
    ];
  }, [rankings, leads, selectedMonth]);

  // ────── SETTER RANKINGS ──────
  const setterRankings: SetterStat[] = useMemo(() => {
    const d = parseLocalDate(selectedMonth);
    const start = getFiscalStart(d);
    const end = getFiscalEnd(d);
    const fiscalLeads = leads.filter((l) => {
      if (!l.fecha_llamada) return false;
      const ld = new Date(l.fecha_llamada);
      return ld >= start && ld <= end;
    });

    const setterMap = new Map<
      string,
      {
        nombre: string;
        agendas: number;
        cerradas: number;
        cashDeLeads: number;
      }
    >();

    for (const l of fiscalLeads) {
      if (!l.setter_id || !l.setter) continue;
      if (!setterMap.has(l.setter_id)) {
        setterMap.set(l.setter_id, {
          nombre: l.setter.nombre,
          agendas: 0,
          cerradas: 0,
          cashDeLeads: 0,
        });
      }
      const entry = setterMap.get(l.setter_id)!;
      entry.agendas++;
      if (
        l.estado === "cerrado" ||
        l.estado === "adentro_seguimiento"
      ) {
        entry.cerradas++;
        entry.cashDeLeads += l.ticket_total;
      }
    }

    return Array.from(setterMap.entries())
      .map(([setterId, data]) => ({
        setterId,
        nombre: data.nombre,
        agendas: data.agendas,
        cerradas: data.cerradas,
        tasa: data.agendas > 0 ? data.cerradas / data.agendas : 0,
        cashDeLeads: data.cashDeLeads,
        comision: data.cashDeLeads * 0.05,
      }))
      .sort((a, b) => b.cashDeLeads - a.cashDeLeads);
  }, [leads, selectedMonth]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Ranking de closers por cash collected
          </p>
        </div>
        <MonthSelector77
          value={selectedMonth}
          onChange={setSelectedMonth}
        />
      </div>

      {/* ═══════ CLOSER CARDS ═══════ */}
      {rankings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
            Ranking Closers
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {rankings.map((r) => {
              const comm = commMap.get(r.closerId);
              const earnedBadges = r.badges.filter((b) => b.earned);
              const isMe = r.closerId === currentMemberId;

              return (
                <div
                  key={r.closerId}
                  className={`bg-[var(--card-bg)] rounded-xl p-5 transition-all hover:scale-[1.02] cursor-default ${borderStyle(r.position)} ${
                    isMe ? "ring-1 ring-[var(--purple)]" : ""
                  }`}
                >
                  {/* Top row: medal + streak */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{medal(r.position)}</span>
                    {r.streak > 0 && (
                      <span className="text-sm text-orange-400 font-medium">
                        {"\u{1F525}"} {r.streak}d
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <p className="font-bold text-base text-white mb-1">
                    {r.nombre}
                    {isMe && (
                      <span className="text-[var(--purple-light)] text-xs ml-1">
                        (vos)
                      </span>
                    )}
                  </p>

                  {/* Cash */}
                  <p className="text-2xl font-bold text-[var(--green)] mb-2">
                    {formatUSD(r.cash)}
                  </p>

                  {/* Stats line */}
                  <p className="text-sm text-[var(--muted)]">
                    {r.cerradas} ventas{" "}
                    {r.cerradas > 0 && (
                      <>
                        &middot;{" "}
                        <span className="text-[var(--purple-light)]">
                          {r.cerradas}
                        </span>{" "}
                        cierres
                      </>
                    )}
                  </p>

                  {/* Commission */}
                  {comm && comm.comision_total > 0 && (
                    <p className="text-xs text-[var(--yellow)] mt-1">
                      Comision: {formatUSD(comm.comision_total)}
                    </p>
                  )}

                  {/* Badges */}
                  {earnedBadges.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--card-border)] flex flex-wrap gap-1">
                      {earnedBadges.map((b) => (
                        <span
                          key={b.id}
                          title={b.label}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--purple)]/15 text-[var(--purple-light)]"
                        >
                          {b.icon} {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ #1 EN CADA METRICA ═══════ */}
      {metricLeaders && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
            {"\u{1F947}"} #1 en cada metrica
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {metricLeaders.map((m) => (
              <div
                key={m.label}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 text-center hover:border-[var(--purple)]/30 transition-colors"
              >
                <span className="text-xl">{m.emoji}</span>
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider mt-2 mb-1">
                  {m.label}
                </p>
                <p className="font-bold text-sm text-white">{m.name}</p>
                <p className="text-xs text-[var(--green)] mt-1">
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ SETTER RANKING ═══════ */}
      {setterRankings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-4">
            Ranking Setters
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {setterRankings.map((s, i) => {
              const pos = i + 1;
              return (
                <div
                  key={s.setterId}
                  className={`bg-[var(--card-bg)] rounded-xl p-5 transition-all hover:scale-[1.02] cursor-default ${
                    pos <= 3 ? borderStyle(pos) : "border border-[var(--card-border)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{medal(pos)}</span>
                  </div>

                  <p className="font-bold text-base text-white mb-1">
                    {s.nombre}
                  </p>
                  <p className="text-xl font-bold text-[var(--green)] mb-2">
                    {formatUSD(s.cashDeLeads)}
                  </p>

                  <div className="text-sm text-[var(--muted)] space-y-1">
                    <p>
                      {s.agendas} agendas &middot; {s.cerradas}{" "}
                      cerradas
                    </p>
                    <p>
                      <span className="text-[var(--purple-light)]">
                        {formatPct(s.tasa)}
                      </span>{" "}
                      tasa
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                    <span className="text-xs text-[var(--muted)]">
                      Comision:{" "}
                    </span>
                    <span className="text-xs font-medium text-[var(--yellow)]">
                      {formatUSD(s.comision)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ OBJECTIVES PROGRESS ═══════ */}
      {objectives.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Progreso vs Objetivo
          </h2>
          <div className="space-y-3">
            {rankings.map((r) => {
              const obj = objMap.get(r.closerId);
              if (!obj || obj.objetivo_cash <= 0) return null;
              const pct = Math.min(
                (r.cash / obj.objetivo_cash) * 100,
                100
              );
              const pctLabel = (
                (r.cash / obj.objetivo_cash) *
                100
              ).toFixed(0);
              return (
                <div key={r.closerId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-white font-medium">
                      {r.nombre}
                    </span>
                    <span className="text-[var(--muted)]">
                      {formatUSD(r.cash)} /{" "}
                      {formatUSD(obj.objetivo_cash)} ({pctLabel}%)
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct >= 100
                          ? "bg-[var(--green)]"
                          : pct >= 70
                            ? "bg-[var(--yellow)]"
                            : "bg-[var(--purple)]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {rankings.length === 0 && setterRankings.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-12 text-center">
          <p className="text-[var(--muted)]">
            Sin datos para este periodo
          </p>
        </div>
      )}
    </div>
  );
}
