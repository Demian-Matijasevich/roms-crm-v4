"use client";

import { useState, useMemo } from "react";
import KPICard from "@/app/components/KPICard";
import DataTable from "@/app/components/DataTable";
import Semaforo from "@/app/components/Semaforo";
import StatusBadge from "@/app/components/StatusBadge";
import EmptyState from "@/app/components/EmptyState";
import SessionFormModal from "./SessionFormModal";
import type { TrackerSession, SessionAvailability, AuthSession } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { parseLocalDate } from "@/lib/date-utils";

type View = "table" | "calendar";

interface SessionWithClient extends TrackerSession {
  client?: { id: string; nombre: string; programa: string };
}

interface Props {
  sessions: SessionWithClient[];
  availability: SessionAvailability[];
  session: AuthSession;
}

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function TrackerClient({ sessions, availability }: Props) {
  const [view, setView] = useState<View>("table");
  const [showModal, setShowModal] = useState(false);
  const [editSession, setEditSession] = useState<SessionWithClient | null>(null);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  // KPIs
  const totalClients = availability.length;
  const totalAvail = availability.reduce((sum, a) => sum + Math.max(a.sesiones_disponibles, 0), 0);
  const totalConsumed = availability.reduce((sum, a) => sum + a.sesiones_consumidas, 0);
  const avgRating = (() => {
    const rated = sessions.filter((s) => s.rating !== null);
    return rated.length > 0 ? rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length : 0;
  })();

  // Alert cards: clients with 0 sessions
  const alertClients = availability.filter((a) => a.semaforo === "agotadas");

  // Calendar data
  const calendarSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (!s.fecha) return false;
      const d = parseLocalDate(s.fecha);
      return d.getMonth() === calMonth && d.getFullYear() === calYear;
    });
  }, [sessions, calMonth, calYear]);

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

  const columns = [
    {
      key: "client_nombre",
      label: "Cliente",
      sortable: true,
      render: (row: Record<string, unknown>) => (
        <span className="font-medium text-white">{(row as unknown as SessionWithClient).client?.nombre ?? "---"}</span>
      ),
    },
    {
      key: "numero_sesion",
      label: "Sesion #",
      sortable: true,
      render: (row: Record<string, unknown>) => <span className="text-white">#{(row as unknown as SessionWithClient).numero_sesion}</span>,
    },
    {
      key: "fecha",
      label: "Fecha",
      sortable: true,
      render: (row: Record<string, unknown>) => formatDate((row as unknown as SessionWithClient).fecha),
    },
    {
      key: "tipo_sesion",
      label: "Tipo",
      render: (row: Record<string, unknown>) => (
        <span className="text-sm">{(row as unknown as SessionWithClient).tipo_sesion.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "estado",
      label: "Estado",
      render: (row: Record<string, unknown>) => <StatusBadge status={(row as unknown as SessionWithClient).estado} />,
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const s = row as unknown as SessionWithClient;
        return (
          <span className={s.rating !== null ? (s.rating! >= 7 ? "text-[var(--green)]" : s.rating! >= 5 ? "text-[var(--yellow)]" : "text-[var(--red)]") : "text-[var(--muted)]"}>
            {s.rating ?? "---"}
          </span>
        );
      },
    },
    {
      key: "pitch_upsell",
      label: "Upsell",
      render: (row: Record<string, unknown>) => (row as unknown as SessionWithClient).pitch_upsell ? <span className="text-[var(--green)]">Si</span> : <span className="text-[var(--muted)]">No</span>,
    },
    {
      key: "action_items",
      label: "Items",
      render: (row: Record<string, unknown>) => {
        const s = row as unknown as SessionWithClient;
        return <span className="text-[var(--muted)]">{Array.isArray(s.action_items) ? s.action_items.length : 0}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Clientes Activos" value={totalClients} icon="users" />
        <KPICard label="Sesiones Disponibles" value={totalAvail} icon="target" />
        <KPICard label="Sesiones Consumidas" value={totalConsumed} icon="check" />
        <KPICard label="Rating Promedio" value={Math.round(avgRating * 10) / 10} icon="star" />
      </div>

      {/* Alert cards */}
      {alertClients.length > 0 && (
        <div className="space-y-2">
          {alertClients.map((a) => (
            <div key={a.client_id} className="bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-white font-medium">{a.nombre}</span>
                <span className="text-[var(--red)] text-sm ml-2">tiene 0 sesiones disponibles</span>
              </div>
              <Semaforo value="agotadas" />
            </div>
          ))}
        </div>
      )}

      {/* View toggle + add button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-[var(--card-bg)] rounded-lg p-1 border border-[var(--card-border)]">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              view === "table" ? "bg-[var(--purple)] text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Tabla
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              view === "calendar" ? "bg-[var(--purple)] text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Calendario
          </button>
        </div>
        <button
          onClick={() => { setEditSession(null); setShowModal(true); }}
          className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm hover:bg-[var(--purple-dark)] transition-colors"
        >
          + Nueva Sesion
        </button>
      </div>

      {/* Session availability per client */}
      <div className="overflow-x-auto">
        <div className="flex gap-2">
          {availability.map((a) => (
            <div key={a.client_id} className="min-w-[140px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-3">
              <p className="text-xs text-white font-medium truncate">{a.nombre}</p>
              <div className="flex items-center gap-1 mt-1">
                <Semaforo value={a.semaforo} />
                <span className="text-xs text-[var(--muted)]">{a.sesiones_consumidas}/{a.llamadas_base}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "table" && (
        sessions.length === 0 ? (
          <EmptyState message="Sin sesiones registradas" />
        ) : (
          <DataTable
            data={sessions as unknown as Record<string, unknown>[]}
            columns={columns}
            searchKey={"client_nombre" as keyof Record<string, unknown>}
            searchPlaceholder="Buscar por cliente..."
            pageSize={20}
            onRowClick={(row) => {
              setEditSession(row as unknown as SessionWithClient);
              setShowModal(true);
            }}
          />
        )
      )}

      {view === "calendar" && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                else setCalMonth(calMonth - 1);
              }}
              className="text-[var(--muted)] hover:text-white px-2"
            >
              &larr;
            </button>
            <span className="text-white font-semibold">{MONTHS_ES[calMonth]} {calYear}</span>
            <button
              onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                else setCalMonth(calMonth + 1);
              }}
              className="text-[var(--muted)] hover:text-white px-2"
            >
              &rarr;
            </button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"].map((d) => (
              <div key={d} className="text-center text-xs text-[var(--muted)] py-1">{d}</div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const daySessions = calendarSessions.filter((s) => s.fecha === dateStr);
              const isToday = dateStr === new Date().toISOString().split("T")[0];

              return (
                <div
                  key={day}
                  className={`min-h-[60px] rounded-lg p-1 text-xs ${
                    isToday ? "bg-[var(--purple)]/10 border border-[var(--purple)]/30" : "bg-black/20"
                  }`}
                >
                  <span className={`${isToday ? "text-[var(--purple-light)]" : "text-[var(--muted)]"}`}>{day}</span>
                  {daySessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => { setEditSession(s); setShowModal(true); }}
                      className="mt-0.5 px-1 py-0.5 rounded bg-[var(--purple)]/20 text-[var(--purple-light)] truncate cursor-pointer hover:bg-[var(--purple)]/30"
                    >
                      {s.client?.nombre ?? "Sesion"}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session form modal */}
      {showModal && (
        <SessionFormModal
          session={editSession}
          onClose={() => { setShowModal(false); setEditSession(null); }}
        />
      )}
    </div>
  );
}
