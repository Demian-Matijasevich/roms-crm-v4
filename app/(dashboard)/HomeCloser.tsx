"use client";

import { useMemo } from "react";
import KPICard from "@/app/components/KPICard";
import StatusBadge from "@/app/components/StatusBadge";
import { formatUSD, formatDate } from "@/lib/format";
import { getCloserStreaks, getCloserBadges } from "@/lib/gamification";
import type { Lead, CloserKPI } from "@/lib/types";

export interface ObjectiveData {
  id: string;
  team_member_id: string;
  mes_fiscal: string;
  objetivo_cash: number;
  objetivo_cierres: number;
  objetivo_agendas: number;
}

interface Props {
  leads: Lead[];
  closerKpis: CloserKPI[];
  currentMemberId: string;
  currentName: string;
  objective?: ObjectiveData | null;
}

export default function HomeCloser({
  leads,
  closerKpis,
  currentMemberId,
  currentName,
  objective,
}: Props) {
  const today = new Date().toISOString().split("T")[0];

  // Personal KPIs
  const myKpis = closerKpis.find((k) => k.team_member_id === currentMemberId);
  const streaks = useMemo(() => getCloserStreaks(leads), [leads]);
  const myStreak = streaks.get(currentMemberId)?.currentStreak ?? 0;
  const badges = useMemo(
    () => getCloserBadges(leads, currentMemberId),
    [leads, currentMemberId]
  );
  const earnedBadges = badges.filter((b) => b.earned);

  // Ranking position
  const ranking = useMemo(() => {
    const sorted = [...closerKpis].sort(
      (a, b) =>
        (b.cerradas * (b.aov || 0)) - (a.cerradas * (a.aov || 0))
    );
    return sorted.findIndex((k) => k.team_member_id === currentMemberId) + 1;
  }, [closerKpis, currentMemberId]);

  // Today's agenda — leads with fecha_llamada = today
  const todayAgenda = useMemo(
    () =>
      leads
        .filter((l) => {
          if (!l.fecha_llamada) return false;
          const llamadaDate = l.fecha_llamada.split("T")[0];
          return (
            llamadaDate === today &&
            l.estado !== "cerrado" &&
            l.estado !== "adentro_seguimiento" &&
            l.estado !== "cancelada" &&
            l.estado !== "broke_cancelado"
          );
        })
        .sort((a, b) =>
          (a.fecha_llamada ?? "").localeCompare(b.fecha_llamada ?? "")
        ),
    [leads, today]
  );

  // Calls made today (including cerrados)
  const callsToday = leads.filter((l) => {
    if (!l.fecha_llamada) return false;
    return l.fecha_llamada.split("T")[0] === today;
  }).length;

  // Recent sales
  const recentSales = useMemo(
    () =>
      leads
        .filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento")
        .sort((a, b) =>
          (b.fecha_llamada ?? "").localeCompare(a.fecha_llamada ?? "")
        )
        .slice(0, 5),
    [leads]
  );

  // Mini leaderboard — top 3 by cash (cerradas * aov)
  const top3 = useMemo(() => {
    return [...closerKpis]
      .map((k) => ({
        ...k,
        cash: k.cerradas * k.aov,
      }))
      .sort((a, b) => b.cash - a.cash)
      .slice(0, 3);
  }, [closerKpis]);

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Hola, {currentName}{" "}
          {myStreak >= 3 ? "\u{1F525}" : ""}
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          {myStreak > 0
            ? `Racha de ${myStreak} dia${myStreak > 1 ? "s" : ""} cerrando`
            : "Empeza tu racha hoy!"}
        </p>
      </div>

      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {earnedBadges.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--purple)]/15 text-[var(--purple-light)] border border-[var(--purple)]/20"
            >
              {b.icon} {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Personal KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Llamadas Hoy"
          value={callsToday}
          format="number"
          icon={"\u{1F4DE}"}
        />
        <KPICard
          label="Mi Streak"
          value={myStreak}
          format="number"
          icon={"\u{1F525}"}
        />
        <KPICard
          label="Mi Posicion"
          value={ranking || closerKpis.length}
          format="number"
          icon={"\u{1F3C6}"}
        />
        <KPICard
          label="Cierres del Mes"
          value={myKpis?.cerradas ?? 0}
          format="number"
          icon={"\u{1F680}"}
        />
      </div>

      {/* Tu objetivo del mes */}
      {objective && objective.objetivo_cash > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Tu Objetivo del Mes</h2>
          {(() => {
            const myCash = (myKpis?.cerradas ?? 0) * (myKpis?.aov ?? 0);
            const pct = objective.objetivo_cash > 0 ? (myCash / objective.objetivo_cash) * 100 : 0;
            const clampedPct = Math.min(pct, 100);
            return (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-[var(--muted)]">Cash</span>
                    <span className="text-white font-medium">
                      {formatUSD(myCash)} / {formatUSD(objective.objetivo_cash)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct >= 100 ? "bg-[var(--green)]" : pct >= 70 ? "bg-[var(--yellow)]" : "bg-[var(--purple)]"
                      }`}
                      style={{ width: `${clampedPct}%` }}
                    />
                  </div>
                </div>
                {objective.objetivo_cierres > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-[var(--muted)]">Cierres</span>
                      <span className="text-white font-medium">
                        {myKpis?.cerradas ?? 0} / {objective.objetivo_cierres}
                      </span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (myKpis?.cerradas ?? 0) >= objective.objetivo_cierres ? "bg-[var(--green)]" : "bg-[var(--purple)]"
                        }`}
                        style={{ width: `${Math.min(((myKpis?.cerradas ?? 0) / objective.objetivo_cierres) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Today's Agenda */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Agenda de Hoy ({todayAgenda.length})
        </h2>
        {todayAgenda.length === 0 ? (
          <p className="text-[var(--muted)] text-sm py-4 text-center">
            No hay llamadas programadas para hoy
          </p>
        ) : (
          <div className="space-y-2">
            {todayAgenda.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">{l.nombre}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {l.programa_pitcheado
                      ? l.programa_pitcheado.replace(/_/g, " ")
                      : "Sin programa"}{" "}
                    {l.fecha_llamada
                      ? new Date(l.fecha_llamada).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
                <StatusBadge status={l.estado} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Sales */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Ultimas Ventas
          </h2>
          {recentSales.length === 0 ? (
            <p className="text-[var(--muted)] text-sm py-4 text-center">
              Sin ventas recientes
            </p>
          ) : (
            <div className="space-y-2">
              {recentSales.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between bg-[var(--green)]/5 border border-[var(--green)]/10 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-white font-medium">{l.nombre}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatDate(l.fecha_llamada)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[var(--green)]">
                    {formatUSD(l.ticket_total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mini Leaderboard */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Top 3 del Mes
          </h2>
          {top3.length === 0 ? (
            <p className="text-[var(--muted)] text-sm py-4 text-center">
              Sin datos
            </p>
          ) : (
            <div className="space-y-3">
              {top3.map((k, i) => {
                const isMe = k.team_member_id === currentMemberId;
                return (
                  <div
                    key={k.team_member_id}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                      isMe
                        ? "bg-[var(--purple)]/10 border border-[var(--purple)]/20"
                        : "bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{medals[i]}</span>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {k.nombre}
                          {isMe ? " (vos)" : ""}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {k.cerradas} cierres
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--green)]">
                      {formatUSD(k.cash)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
