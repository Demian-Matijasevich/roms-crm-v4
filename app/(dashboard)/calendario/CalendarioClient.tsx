"use client";

import { useState, useMemo } from "react";
import { formatUSD } from "@/lib/format";

// Exported types for the server component
export interface CalendarLead {
  id: string;
  nombre: string;
  fecha_llamada: string;
  estado: string;
  instagram: string | null;
  telefono: string | null;
  programa_pitcheado: string | null;
  link_llamada: string | null;
  closer_nombre: string | null;
  setter_nombre: string | null;
  ticket_total: number;
}

export interface CalendarPayment {
  id: string;
  client_id: string | null;
  lead_id: string | null;
  numero_cuota: number;
  monto_usd: number;
  fecha_vencimiento: string;
  estado: string;
  nombre: string | null;
  instagram: string | null;
  telefono: string | null;
}

export interface CalendarRenewal {
  id: string;
  nombre: string;
  programa: string;
  fecha_onboarding: string;
  total_dias_programa: number;
  fecha_vencimiento: string;
  dias_restantes: number;
  estado_contacto: string;
  health_score: number;
  semaforo: string;
  telefono: string | null;
}

interface Props {
  leads: CalendarLead[];
  payments: CalendarPayment[];
  renewals: CalendarRenewal[];
}

const DAYS_HEADER = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

interface DayData {
  date: string; // YYYY-MM-DD
  day: number;
  isCurrentMonth: boolean;
  llamadas: CalendarLead[];
  cuotas: CalendarPayment[];
  renovaciones: CalendarRenewal[];
  sales: CalendarLead[];
  cashCollected: number;
}

function getMonthGrid(
  year: number,
  month: number,
  leads: CalendarLead[],
  payments: CalendarPayment[],
  renewals: CalendarRenewal[]
): DayData[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: DayData[] = [];

  // Fill leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(makeDayData(d, false, leads, payments, renewals));
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    days.push(makeDayData(date, true, leads, payments, renewals));
  }

  // Fill trailing days
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push(makeDayData(d, false, leads, payments, renewals));
    }
  }

  return days;
}

function makeDayData(
  date: Date,
  isCurrentMonth: boolean,
  leads: CalendarLead[],
  payments: CalendarPayment[],
  renewals: CalendarRenewal[]
): DayData {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const dayLeads = leads.filter((l) => l.fecha_llamada === dateStr);
  const sales = dayLeads.filter(
    (l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento"
  );
  const nonSales = dayLeads.filter(
    (l) =>
      l.estado !== "cerrado" &&
      l.estado !== "adentro_seguimiento" &&
      l.estado !== "cancelada" &&
      l.estado !== "broke_cancelado"
  );
  const cashCollected = sales.reduce((s, l) => s + (l.ticket_total || 0), 0);

  return {
    date: dateStr,
    day: date.getDate(),
    isCurrentMonth,
    llamadas: nonSales,
    cuotas: payments.filter((p) => p.fecha_vencimiento === dateStr),
    renovaciones: renewals.filter((r) => r.fecha_vencimiento === dateStr),
    sales,
    cashCollected,
  };
}

function formatCashBadge(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return "$" + n.toLocaleString("es-AR");
}

function igUrl(handle: string | null): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^@/, "");
  return `https://instagram.com/${clean}`;
}

function ContactLinks({
  instagram,
  telefono,
}: {
  instagram: string | null;
  telefono: string | null;
}) {
  return (
    <div className="flex items-center gap-2 mt-1">
      {instagram && (
        <a
          href={igUrl(instagram)!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-pink-400 hover:text-pink-300 underline underline-offset-2"
        >
          @{instagram.replace(/^@/, "")}
        </a>
      )}
      {telefono && (
        <a
          href={`tel:${telefono}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          {telefono}
        </a>
      )}
    </div>
  );
}

export default function CalendarioClient({ leads, payments, renewals }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const grid = useMemo(
    () => getMonthGrid(year, month, leads, payments, renewals),
    [year, month, leads, payments, renewals]
  );

  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    return grid.find((d) => d.date === selectedDay) ?? null;
  }, [selectedDay, grid]);

  const monthLabel = new Date(year, month).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });

  // Monthly summary stats
  const monthStats = useMemo(() => {
    let cash = 0;
    let calls = 0;
    let cuotas = 0;

    for (const day of grid) {
      if (!day.isCurrentMonth) continue;
      cash += day.cashCollected;
      calls += day.llamadas.length;
      cuotas += day.cuotas.length;
    }
    return { cash, calls, cuotas };
  }, [grid]);

  function prevMonth() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  }

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setSelectedDay(todayStr);
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">Calendario Financiero</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm hover:bg-white/10 transition-colors"
          >
            &larr;
          </button>
          <span className="text-sm font-medium capitalize min-w-[160px] text-center text-white">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm hover:bg-white/10 transition-colors"
          >
            &rarr;
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg bg-[var(--purple)]/20 text-[var(--purple-light)] text-sm font-medium hover:bg-[var(--purple)]/30 transition-colors ml-2"
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Monthly summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3">
          <p className="text-xs text-[var(--muted)]">Cash del mes</p>
          <p className="text-lg font-bold text-[var(--green)]">
            {formatUSD(monthStats.cash)}
          </p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3">
          <p className="text-xs text-[var(--muted)]">Llamadas agendadas</p>
          <p className="text-lg font-bold text-[var(--purple-light)]">
            {monthStats.calls}
          </p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3">
          <p className="text-xs text-[var(--muted)]">Cuotas pendientes</p>
          <p className="text-lg font-bold text-[var(--red)]">
            {monthStats.cuotas}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--green)] inline-block" />{" "}
          Cash
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--purple)] inline-block" />{" "}
          Llamadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--red)] inline-block" />{" "}
          Cuotas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />{" "}
          Renovaciones
        </span>
      </div>

      {/* Calendar grid */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 border-b border-[var(--card-border)]">
          {DAYS_HEADER.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-medium text-[var(--muted)] uppercase"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const hasItems =
              day.llamadas.length > 0 ||
              day.cuotas.length > 0 ||
              day.renovaciones.length > 0 ||
              day.sales.length > 0;
            const isToday = day.date === todayStr;
            const isSelected = day.date === selectedDay;

            return (
              <div
                key={day.date}
                onClick={() =>
                  hasItems
                    ? setSelectedDay(isSelected ? null : day.date)
                    : undefined
                }
                className={`min-h-[80px] sm:min-h-[100px] p-1.5 sm:p-2 border-b border-r border-[var(--card-border)] transition-colors flex flex-col ${
                  !day.isCurrentMonth ? "opacity-30" : ""
                } ${hasItems ? "cursor-pointer hover:bg-white/5" : ""} ${
                  isSelected
                    ? "bg-[var(--purple)]/10 ring-1 ring-[var(--purple)]"
                    : ""
                }`}
              >
                <div
                  className={`text-xs sm:text-sm font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    isToday
                      ? "bg-[var(--purple)] text-white"
                      : "text-white"
                  }`}
                >
                  {day.day}
                </div>

                <div className="mt-1 space-y-0.5 flex-1">
                  {/* Cash badge (green) */}
                  {day.cashCollected > 0 && (
                    <div className="text-[10px] sm:text-xs bg-[var(--green)]/15 text-[var(--green)] rounded px-1 py-0.5 truncate font-medium">
                      {formatCashBadge(day.cashCollected)}
                    </div>
                  )}
                  {/* Calls badge (purple) */}
                  {day.llamadas.length > 0 && (
                    <div className="text-[10px] sm:text-xs bg-[var(--purple)]/15 text-[var(--purple-light)] rounded px-1 py-0.5 truncate">
                      {day.llamadas.length} call
                      {day.llamadas.length > 1 ? "s" : ""}
                    </div>
                  )}
                  {/* Cuotas badge (red) */}
                  {day.cuotas.length > 0 && (
                    <div className="text-[10px] sm:text-xs bg-[var(--red)]/15 text-[var(--red)] rounded px-1 py-0.5 truncate">
                      {day.cuotas.length} cuota
                      {day.cuotas.length > 1 ? "s" : ""}
                    </div>
                  )}
                  {/* Renovaciones badge (green-500) */}
                  {day.renovaciones.length > 0 && (
                    <div className="text-[10px] sm:text-xs bg-green-500/15 text-green-400 rounded px-1 py-0.5 truncate">
                      {day.renovaciones.length} renov
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDayData && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">
              {new Date(
                selectedDayData.date + "T12:00:00"
              ).toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-[var(--muted)] hover:text-white text-sm"
            >
              &times;
            </button>
          </div>

          {selectedDayData.sales.length === 0 &&
            selectedDayData.llamadas.length === 0 &&
            selectedDayData.cuotas.length === 0 &&
            selectedDayData.renovaciones.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Sin actividad este dia.
              </p>
            )}

          {/* Sales */}
          {selectedDayData.sales.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--green)] uppercase mb-2 tracking-wider">
                Ventas ({selectedDayData.sales.length})
              </h4>
              <div className="space-y-1.5">
                {selectedDayData.sales.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-sm bg-[var(--green)]/5 border border-[var(--green)]/10 rounded-lg px-3 py-2"
                  >
                    <div>
                      <span className="font-medium text-white">{s.nombre}</span>
                      {s.programa_pitcheado && (
                        <span className="text-[var(--muted)] ml-2 text-xs">
                          {s.programa_pitcheado.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[var(--green)] font-semibold">
                        {formatUSD(s.ticket_total)}
                      </span>
                      {s.closer_nombre && (
                        <span className="text-[var(--muted)] ml-2 text-xs">
                          {s.closer_nombre}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Calls */}
          {selectedDayData.llamadas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--purple-light)] uppercase mb-2 tracking-wider">
                Llamadas programadas ({selectedDayData.llamadas.length})
              </h4>
              <div className="space-y-1.5">
                {selectedDayData.llamadas.map((l) => (
                  <div
                    key={l.id}
                    className="bg-[var(--purple)]/5 border border-[var(--purple)]/10 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-white">{l.nombre}</span>
                      <span className="text-xs text-[var(--muted)] capitalize">
                        {l.estado?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <ContactLinks instagram={l.instagram} telefono={l.telefono} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[var(--muted)]">
                      {l.closer_nombre && (
                        <span>
                          Closer:{" "}
                          <span className="text-white">{l.closer_nombre}</span>
                        </span>
                      )}
                      {l.setter_nombre && (
                        <span>
                          Setter:{" "}
                          <span className="text-white">{l.setter_nombre}</span>
                        </span>
                      )}
                      {l.programa_pitcheado && (
                        <span>
                          Programa:{" "}
                          <span className="text-white">
                            {l.programa_pitcheado.replace(/_/g, " ")}
                          </span>
                        </span>
                      )}
                      {l.link_llamada && (
                        <a
                          href={l.link_llamada}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                        >
                          Link llamada
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cuotas */}
          {selectedDayData.cuotas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--red)] uppercase mb-2 tracking-wider">
                Cuotas pendientes ({selectedDayData.cuotas.length})
              </h4>
              <div className="space-y-1.5">
                {selectedDayData.cuotas.map((p) => (
                  <div
                    key={p.id}
                    className="bg-[var(--red)]/5 border border-[var(--red)]/10 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">
                        {p.nombre || "Sin nombre"}
                      </span>
                      <span className="text-sm font-semibold text-[var(--red)]">
                        {formatUSD(p.monto_usd)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mb-1">
                      Cuota #{p.numero_cuota}
                    </div>
                    <ContactLinks
                      instagram={p.instagram}
                      telefono={p.telefono}
                    />
                    <div className="mt-2">
                      <a
                        href="/cobranzas"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-medium text-[var(--yellow)] hover:text-yellow-300 underline underline-offset-2"
                      >
                        Ir a cobranzas
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Renovaciones */}
          {selectedDayData.renovaciones.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-green-400 uppercase mb-2 tracking-wider">
                Renovaciones ({selectedDayData.renovaciones.length})
              </h4>
              <div className="space-y-1.5">
                {selectedDayData.renovaciones.map((r) => (
                  <div
                    key={r.id}
                    className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-white">
                          {r.nombre}
                        </span>
                        <span className="text-xs text-[var(--muted)] ml-2">
                          {r.programa?.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          r.semaforo === "vencido"
                            ? "text-[var(--red)]"
                            : r.semaforo === "urgente"
                              ? "text-[var(--yellow)]"
                              : "text-[var(--green)]"
                        }`}
                      >
                        {r.dias_restantes}d restantes
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-[var(--muted)]">
                      <span>
                        Health:{" "}
                        <span
                          className={`font-medium ${
                            r.health_score >= 80
                              ? "text-green-400"
                              : r.health_score >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {r.health_score}
                        </span>
                      </span>
                    </div>
                    {r.telefono && (
                      <div className="mt-1">
                        <a
                          href={`tel:${r.telefono}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2"
                        >
                          {r.telefono}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
