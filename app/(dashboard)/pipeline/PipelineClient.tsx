"use client";

import { useState, useMemo } from "react";
import type { AuthSession, TeamMember, Payment, LeadEstado, LeadScore, EtapaPolitica } from "@/lib/types";
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
  usdRate: number;
  session: AuthSession;
  isAdmin: boolean;
  isPolitica?: boolean;
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

type PolColumn = {
  key: EtapaPolitica;
  title: string;
  headerColor: string;
  borderColor: string;
};

const COLUMNS_POLITICA: PolColumn[] = [
  { key: "nuevo",       title: "Nuevo",       headerColor: "bg-blue-500/20 text-blue-300",     borderColor: "border-blue-500/30" },
  { key: "caliente",    title: "Caliente",    headerColor: "bg-orange-500/20 text-orange-300", borderColor: "border-orange-500/30" },
  { key: "aserrado",    title: "Aserrado",    headerColor: "bg-yellow-500/20 text-yellow-300", borderColor: "border-yellow-500/30" },
  { key: "preserrado",  title: "Preserrado",  headerColor: "bg-emerald-500/20 text-emerald-300", borderColor: "border-emerald-500/30" },
  { key: "cerrado",     title: "Cerrado",     headerColor: "bg-green-500/20 text-green-400",   borderColor: "border-green-500/30" },
  { key: "perdido",     title: "Perdido",     headerColor: "bg-red-500/20 text-red-400",       borderColor: "border-red-500/30" },
];

function classifyLead(estado: LeadEstado): string {
  for (const col of COLUMNS) {
    if (col.matchEstados.includes(estado)) return col.key;
  }
  return "pendiente";
}

function classifyPolitica(etapa: EtapaPolitica | null | undefined): EtapaPolitica {
  return etapa || "nuevo";
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
  leads: leadsProp,
  paymentsByLead,
  closers,
  setters,
  usdRate,
  session,
  isAdmin,
  isPolitica = false,
}: Props) {
  const [leads, setLeads] = useState<LeadWithTeam[]>(leadsProp);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [closerFilter, setCloserFilter] = useState<string>("todos");
  const [setterFilter, setSetterFilter] = useState<string>("todos");
  const [monthFilter, setMonthFilter] = useState<string>("todos");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingEtapa, setSavingEtapa] = useState<string | null>(null);
  const [misLeadsOnly, setMisLeadsOnly] = useState<boolean>(false);
  const [tomandoId, setTomandoId] = useState<string | null>(null);

  async function tomarLead(leadId: string) {
    setTomandoId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/tomar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`No se pudo tomar: ${err.error || res.statusText}`);
        return;
      }
      // refresh local: setear closer_id en lead
      setLeads((prev) => prev.map((l) => l.id === leadId ? ({ ...l, closer_id: session.team_member_id } as LeadWithTeam) : l));
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTomandoId(null);
    }
  }

  async function moveEtapaPolitica(leadId: string, etapa: EtapaPolitica) {
    setSavingEtapa(leadId);
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? ({ ...l, etapa_politica: etapa } as LeadWithTeam) : l)));
    try {
      const res = await fetch(`/api/leads/${leadId}/etapa-politica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa }),
      });
      if (!res.ok) {
        // Revertir
        setLeads(leadsProp);
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || res.statusText}`);
      }
    } catch (err) {
      setLeads(leadsProp);
      alert(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingEtapa(null);
    }
  }

  const monthOptions = useMemo(() => getFiscalMonthOptions(12), []);

  // Suppress unused variable warning
  void session;

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (closerFilter !== "todos" && lead.closer_id !== closerFilter) return false;
      if (setterFilter !== "todos" && lead.setter_id !== setterFilter) return false;
      // Filtro "Mis leads": muestra los que asigné yo + los sin asignar (bandeja entrada)
      if (isPolitica && misLeadsOnly && session.team_member_id) {
        if (lead.closer_id && lead.closer_id !== session.team_member_id) return false;
      }

      if (monthFilter !== "todos" && lead.fecha_llamada) {
        const llamadaDate = parseLocalDate(lead.fecha_llamada);
        const monthStart = parseLocalDate(monthFilter);
        const monthEnd = getFiscalEnd(monthStart);
        if (llamadaDate < monthStart || llamadaDate > monthEnd) return false;
      }

      return true;
    });
  }, [leads, closerFilter, setterFilter, monthFilter, isPolitica, misLeadsOnly, session.team_member_id]);

  const buckets = useMemo(() => {
    if (isPolitica) {
      const map: Record<string, LeadWithTeam[]> = { nuevo: [], caliente: [], aserrado: [], preserrado: [], cerrado: [], perdido: [] };
      for (const lead of filtered) {
        const key = classifyPolitica((lead as unknown as { etapa_politica?: EtapaPolitica }).etapa_politica);
        map[key].push(lead);
      }
      return map;
    }
    const map: Record<string, LeadWithTeam[]> = { pendiente: [], seguimiento: [], cerrado: [], perdido: [] };
    for (const lead of filtered) {
      const key = classifyLead(lead.estado);
      map[key].push(lead);
    }
    return map;
  }, [filtered, isPolitica]);

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
          <h1 className="text-xl font-bold">{isPolitica ? "Pipeline Política" : (isAdmin ? "Pipeline" : "Mi Pipeline")}</h1>
          <p className="text-sm text-[var(--muted)]">{filtered.length} leads en total</p>
        </div>

        {isPolitica && session.team_member_id && (
          <button
            onClick={() => setMisLeadsOnly((v) => !v)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${misLeadsOnly ? "bg-[var(--purple)]/20 border-[var(--purple)]/40 text-[var(--purple)]" : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
            title="Solo míos + sin asignar"
          >
            {misLeadsOnly ? "👤 Mis leads" : "🌐 Todos"}
          </button>
        )}

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

      {/* Kanban Board — Política (6 columnas con drag&drop) */}
      {isPolitica && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {COLUMNS_POLITICA.map((col) => {
            const items = buckets[col.key] || [];
            return (
              <div
                key={col.key}
                className="flex flex-col"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const leadId = e.dataTransfer.getData("text/plain");
                  if (leadId) moveEtapaPolitica(leadId, col.key);
                  setDraggedId(null);
                }}
              >
                <div className={`rounded-t-lg px-3 py-2 ${col.headerColor} border ${col.borderColor} border-b-0`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{col.title}</span>
                    <span className="text-xs font-mono opacity-80">{items.length}</span>
                  </div>
                </div>
                <div className={`flex-1 border ${col.borderColor} border-t-0 rounded-b-lg bg-[var(--card-bg)]/30 p-2 space-y-2 min-h-[200px] max-h-[70vh] overflow-y-auto`}>
                  {items.length === 0 && (
                    <p className="text-xs text-[var(--muted)] text-center py-6">Soltá un lead acá</p>
                  )}
                  {items.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); setDraggedId(lead.id); }}
                      onDragEnd={() => setDraggedId(null)}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`w-full text-left bg-[#0d0d0f] border border-[var(--card-border)] rounded-lg p-3 hover:border-[var(--purple)]/40 hover:bg-[#111113] transition-all cursor-grab active:cursor-grabbing ${draggedId === lead.id ? "opacity-40" : ""} ${savingEtapa === lead.id ? "ring-1 ring-[var(--purple)]/60" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{lead.nombre || "Sin nombre"}</p>
                        <LeadScoreBadge score={lead.lead_score} />
                      </div>
                      {lead.programa_pitcheado && (
                        <p className="text-[10px] text-[var(--muted)] mt-1">
                          {PROGRAMS[lead.programa_pitcheado]?.label || lead.programa_pitcheado}
                        </p>
                      )}
                      {lead.ticket_total > 0 && (
                        <p className="text-xs text-green-400 font-medium mt-1">{formatUSD(lead.ticket_total)}</p>
                      )}
                      {lead.closer?.nombre && (
                        <p className="text-[10px] text-[var(--muted)] mt-1.5">👤 {lead.closer.nombre}</p>
                      )}
                      {!lead.closer?.nombre && session.team_member_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); tomarLead(lead.id); }}
                          disabled={tomandoId === lead.id}
                          className="mt-1.5 w-full text-[10px] py-1 rounded bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 transition-colors disabled:opacity-50"
                        >
                          {tomandoId === lead.id ? "Tomando…" : "🙋 Tomar este lead"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Kanban Board — General (4 columnas) */}
      {!isPolitica && (
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
      )}

      {/* Lead Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          payments={paymentsByLead[selectedLead.id] || []}
          usdRate={usdRate}
          onClose={() => setSelectedLeadId(null)}
          onEstadoChange={handleEstadoChange}
        />
      )}
    </div>
  );
}
