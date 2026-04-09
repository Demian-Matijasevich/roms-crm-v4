"use client";

import { useState, useMemo } from "react";
import type { AuthSession, TeamMember, Payment, LeadEstado, LeadScore } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { LEAD_ESTADOS_LABELS, PROGRAMS } from "@/lib/constants";
import { formatUSD } from "@/lib/format";
import { getFiscalMonthOptions, getFiscalEnd, parseLocalDate } from "@/lib/date-utils";
import LeadDetailPanel from "./LeadDetailPanel";

interface Props {
  leads: LeadWithTeam[];
  paymentsByLead: Record<string, Payment[]>;
  closers: TeamMember[];
  setters: TeamMember[];
  session: AuthSession;
  isAdmin: boolean;
}

const SCORE_COLORS: Record<string, string> = {
  A: "bg-green-500/20 text-green-400 border-green-500/30",
  B: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  C: "bg-orange-400/20 text-orange-400 border-orange-400/30",
  D: "bg-red-500/20 text-red-400 border-red-500/30",
};

type Column = {
  key: string;
  title: string;
  headerColor: string;
  borderColor: string;
  matchEstados: LeadEstado[];
};

const COLUMNS: Column[] = [
  {
    key: "pendiente",
    title: "Pendiente",
    headerColor: "bg-purple-500/20 text-purple-300",
    borderColor: "border-purple-500/30",
    matchEstados: ["pendiente", "reprogramada"],
  },
  {
    key: "seguimiento",
    title: "Seguimiento",
    headerColor: "bg-yellow-500/20 text-yellow-400",
    borderColor: "border-yellow-500/30",
    matchEstados: ["seguimiento", "reserva"],
  },
  {
    key: "cerrado",
    title: "Cerrado",
    headerColor: "bg-green-500/20 text-green-400",
    borderColor: "border-green-500/30",
    matchEstados: ["cerrado", "adentro_seguimiento"],
  },
  {
    key: "perdido",
    title: "Perdido",
    headerColor: "bg-red-500/20 text-red-400",
    borderColor: "border-red-500/30",
    matchEstados: ["no_show", "cancelada", "no_calificado", "no_cierre", "broke_cancelado"],
  },
];

function classifyLead(estado: LeadEstado): string {
  for (const col of COLUMNS) {
    if (col.matchEstados.includes(estado)) return col.key;
  }
  return "pendiente";
}

function LeadScoreBadge({ score }: { score: LeadScore | null }) {
  if (!score) return null;
  const color = SCORE_COLORS[score] || "bg-gray-500/15 text-gray-400 border-gray-500/20";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {score}
    </span>
  );
}

export default function PipelineClient({
  leads,
  paymentsByLead,
  closers,
  setters,
  session,
  isAdmin,
}: Props) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [closerFilter, setCloserFilter] = useState<string>("todos");
  const [setterFilter, setSetterFilter] = useState<string>("todos");
  const [monthFilter, setMonthFilter] = useState<string>("todos");

  const monthOptions = useMemo(() => getFiscalMonthOptions(12), []);

  // Suppress unused variable warning
  void session;

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (closerFilter !== "todos" && lead.closer_id !== closerFilter) return false;
      if (setterFilter !== "todos" && lead.setter_id !== setterFilter) return false;

      if (monthFilter !== "todos" && lead.fecha_llamada) {
        const llamadaDate = parseLocalDate(lead.fecha_llamada);
        const monthStart = parseLocalDate(monthFilter);
        const monthEnd = getFiscalEnd(monthStart);
        if (llamadaDate < monthStart || llamadaDate > monthEnd) return false;
      }

      return true;
    });
  }, [leads, closerFilter, setterFilter, monthFilter]);

  const buckets = useMemo(() => {
    const map: Record<string, LeadWithTeam[]> = {
      pendiente: [],
      seguimiento: [],
      cerrado: [],
      perdido: [],
    };
    for (const lead of filtered) {
      const key = classifyLead(lead.estado);
      map[key].push(lead);
    }
    return map;
  }, [filtered]);

  const selectedLead = selectedLeadId
    ? leads.find((l) => l.id === selectedLeadId) || null
    : null;

  function handleEstadoChange(_leadId: string, _newEstado: LeadEstado) {
    // Optimistic: close the panel for now.
    setSelectedLeadId(null);
  }

  const selectClass =
    "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{isAdmin ? "Pipeline" : "Mi Pipeline"}</h1>
          <p className="text-sm text-[var(--muted)]">{filtered.length} leads en total</p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <select
              value={closerFilter}
              onChange={(e) => setCloserFilter(e.target.value)}
              className={selectClass}
            >
              <option value="todos">Todos los closers</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>

            <select
              value={setterFilter}
              onChange={(e) => setSetterFilter(e.target.value)}
              className={selectClass}
            >
              <option value="todos">Todos los setters</option>
              {setters.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>

            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className={selectClass}
            >
              <option value="todos">Todos los meses</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const items = buckets[col.key];
          return (
            <div key={col.key} className="flex flex-col">
              {/* Column Header */}
              <div className={`rounded-t-lg px-3 py-2 ${col.headerColor} border ${col.borderColor} border-b-0`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.title}</span>
                  <span className="text-xs font-mono opacity-80">{items.length}</span>
                </div>
              </div>

              {/* Cards Container */}
              <div className={`flex-1 border ${col.borderColor} border-t-0 rounded-b-lg bg-[var(--card-bg)]/30 p-2 space-y-2 max-h-[70vh] overflow-y-auto`}>
                {items.length === 0 && (
                  <p className="text-xs text-[var(--muted)] text-center py-6">Sin leads</p>
                )}
                {items.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="w-full text-left bg-[#0d0d0f] border border-[var(--card-border)] rounded-lg p-3 hover:border-[var(--purple)]/40 hover:bg-[#111113] transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{lead.nombre || "Sin nombre"}</p>
                      <LeadScoreBadge score={lead.lead_score} />
                    </div>

                    {/* Programa + ticket */}
                    {lead.programa_pitcheado && (
                      <p className="text-[10px] text-[var(--muted)] mt-1">
                        {PROGRAMS[lead.programa_pitcheado]?.label || lead.programa_pitcheado}
                      </p>
                    )}

                    {col.key === "cerrado" && lead.ticket_total > 0 && (
                      <p className="text-xs text-green-400 font-medium mt-1">
                        {formatUSD(lead.ticket_total)}
                      </p>
                    )}

                    {col.key === "perdido" && (
                      <p className="text-xs text-[var(--muted)]/60 mt-1">
                        {LEAD_ESTADOS_LABELS[lead.estado] || lead.estado}
                      </p>
                    )}

                    {/* Setter/Closer for admin */}
                    {isAdmin && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {lead.setter?.nombre && (
                          <span className="text-[10px] text-[var(--muted)]">S: {lead.setter.nombre}</span>
                        )}
                        {lead.closer?.nombre && (
                          <span className="text-[10px] text-[var(--muted)]">C: {lead.closer.nombre}</span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lead Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          payments={paymentsByLead[selectedLead.id] || []}
          onClose={() => setSelectedLeadId(null)}
          onEstadoChange={handleEstadoChange}
        />
      )}
    </div>
  );
}
