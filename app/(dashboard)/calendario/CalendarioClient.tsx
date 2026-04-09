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
}

function getMonthGrid(year: number, month: number, leads: CalendarLead[], payments: CalendarPayment[], renewals: CalendarRenewal[]): DayData[] {
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

function makeDayData(date: Date, isCurrentMonth: boolean, leads: CalendarLead[], payments: CalendarPayment[], renewals: CalendarRenewal[]): DayData {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return {
    date: dateStr,
    day: date.getDate(),
    isCurrentMonth,
    llamadas: leads.filter((l) => l.fecha_llamada === dateStr),
    cuotas: payments.filter((p) => p.fecha_vencimiento === dateStr),
    renovaciones: renewals.filter((r) => r.fecha_vencimiento === dateStr),
  };
}

function igUrl(handle: string | null): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^@/, "");
  return `https://instagram.com/${clean}`;
}

function ContactLinks({ instagram, telefono }: { instagram: string | null; telefono: string | null }) {
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

  const grid = useMemo(() => getMonthGrid(year, month, leads, payments, renewals), [year, month, leads, payments, renewals]);

  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    return grid.find((d) => d.date === selectedDay) ?? null;
  }, [selectedDay, grid]);

  const monthLabel = new Date(year, month).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

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

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="px-3 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white hover:bg-white/10 text-sm">
          &larr; Anterior
        </button>
        <h2 className="text-lg font-semibold text-white capitalize">{monthLabel}</h2>
        <button onClick={nextMonth} className="px-3 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white hover:bg-white/10 text-sm">
          Siguiente &rarr;
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Llamadas</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Cuotas</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Renovaciones</span>
      </div>

      {/* Calendar grid */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 border-b border-[var(--card-border)]">
          {DAYS_HEADER.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-[var(--muted)] uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const hasItems = day.llamadas.length > 0 || day.cuotas.length > 0 || day.renovaciones.length > 0;
            const isToday = day.date === todayStr;
            const isSelected = day.date === selectedDay;

            return (
              <div
                key={day.date}
                onClick={() => hasItems ? setSelectedDay(isSelected ? null : day.date) : undefined}
                className={`min-h-[80px] p-2 border-b border-r border-[var(--card-border)] transition-colors ${
                  !day.isCurrentMonth ? "opacity-30" : ""
                } ${hasItems ? "cursor-pointer hover:bg-white/5" : ""} ${
                  isSelected ? "bg-[var(--purple)]/10 ring-1 ring-[var(--purple)]" : ""
                }`}
              >
                <div className={`text-sm font-medium mb-1 ${isToday ? "text-[var(--purple-light)] font-bold" : "text-white"}`}>
                  {day.day}
                </div>
                <div className="flex flex-wrap gap-1">
                  {day.llamadas.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-blue-400">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      {day.llamadas.length}
                    </span>
                  )}
                  {day.cuotas.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                      {day.cuotas.length}
                    </span>
                  )}
                  {day.renovaciones.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                      {day.renovaciones.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded day panel */}
      {selectedDayData && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4">
          <h3 className="text-white font-semibold">
            {new Date(selectedDayData.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </h3>

          {/* Llamadas */}
          {selectedDayData.llamadas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-blue-400 uppercase mb-2">Llamadas programadas ({selectedDayData.llamadas.length})</h4>
              <div className="space-y-2">
                {selectedDayData.llamadas.map((l) => (
                  <div key={l.id} className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{l.nombre}</span>
                      <span className="text-xs text-[var(--muted)] capitalize">{l.estado?.replace(/_/g, " ")}</span>
                    </div>
                    <ContactLinks instagram={l.instagram} telefono={l.telefono} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[var(--muted)]">
                      {l.closer_nombre && <span>Closer: <span className="text-white">{l.closer_nombre}</span></span>}
                      {l.programa_pitcheado && <span>Programa: <span className="text-white">{l.programa_pitcheado.replace(/_/g, " ")}</span></span>}
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
              <h4 className="text-xs font-semibold text-yellow-400 uppercase mb-2">Cuotas por vencer ({selectedDayData.cuotas.length})</h4>
              <div className="space-y-2">
                {selectedDayData.cuotas.map((p) => (
                  <div key={p.id} className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{p.nombre || "Sin nombre"}</span>
                      <span className="text-sm font-semibold text-yellow-400">{formatUSD(p.monto_usd)}</span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mb-1">
                      Cuota #{p.numero_cuota}
                    </div>
                    <ContactLinks instagram={p.instagram} telefono={p.telefono} />
                    <div className="mt-2">
                      <a
                        href="/cobranzas"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-medium text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
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
              <h4 className="text-xs font-semibold text-green-400 uppercase mb-2">Renovaciones ({selectedDayData.renovaciones.length})</h4>
              <div className="space-y-2">
                {selectedDayData.renovaciones.map((r) => (
                  <div key={r.id} className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium text-white">{r.nombre}</span>
                        <span className="text-xs text-[var(--muted)] ml-2">{r.programa?.replace(/_/g, " ")}</span>
                      </div>
                      <span className={`text-xs font-medium ${
                        r.semaforo === "vencido" ? "text-[var(--red)]" :
                        r.semaforo === "urgente" ? "text-[var(--yellow)]" :
                        "text-[var(--green)]"
                      }`}>
                        {r.dias_restantes}d restantes
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-[var(--muted)]">
                      <span>Health: <span className={`font-medium ${r.health_score >= 80 ? "text-green-400" : r.health_score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{r.health_score}</span></span>
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
