"use client";

import { useState, useMemo, useCallback } from "react";
import type { AuthSession, TeamMember, Payment, LeadEstado, LeadScore, EtapaPolitica } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { LEAD_ESTADOS_LABELS, PROGRAMS } from "@/lib/constants";
import { formatUSD } from "@/lib/format";
import { getFiscalMonthOptions, getFiscalEnd, parseLocalDate } from "@/lib/date-utils";
import LeadDetailPanel from "./LeadDetailPanel";
import CerrarPoliticaModal from "./CerrarPoliticaModal";
import type { LeadKanbanSummary, LeadLabel } from "./page";

interface Props {
  leads: LeadWithTeam[];
  paymentsByLead: Record<string, Payment[]>;
  closers: TeamMember[];
  setters: TeamMember[];
  usdRate: number;
  session: AuthSession;
  isAdmin: boolean;
  isPolitica?: boolean;
  summaryByLead?: Record<string, LeadKanbanSummary>;
  allLabels?: LeadLabel[];
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

const EMPTY_SUMMARY: LeadKanbanSummary = {
  comments_count: 0,
  checklist_done: 0,
  checklist_total: 0,
  attachments_count: 0,
  labels: [],
};

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
  summaryByLead: summaryProp = {},
  allLabels = [],
}: Props) {
  const [leads, setLeads] = useState<LeadWithTeam[]>(leadsProp);
  const [summaryByLead, setSummaryByLead] = useState<Record<string, LeadKanbanSummary>>(summaryProp);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [closerFilter, setCloserFilter] = useState<string>("todos");
  const [setterFilter, setSetterFilter] = useState<string>("todos");
  const [monthFilter, setMonthFilter] = useState<string>("todos");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingEtapa, setSavingEtapa] = useState<string | null>(null);
  const [misLeadsOnly, setMisLeadsOnly] = useState<boolean>(false);
  const [tomandoId, setTomandoId] = useState<string | null>(null);
  const [cerrandoLead, setCerrandoLead] = useState<LeadWithTeam | null>(null);

  // Optimizaciones extra
  const [search, setSearch] = useState<string>("");
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [compact, setCompact] = useState<boolean>(false);
  const [showLabelMenu, setShowLabelMenu] = useState<boolean>(false);

  // Refresca el resumen (counts + labels) de un lead puntual luego de cambios en el detalle.
  const refreshLeadSummary = useCallback(async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/labels`);
      const labelsJson = res.ok ? await res.json() : { labels: [] };
      // Counts: hacemos un fetch chico paralelo
      const [cRes, kRes, aRes] = await Promise.all([
        fetch(`/api/leads/${leadId}/comments`),
        fetch(`/api/leads/${leadId}/checklist`),
        fetch(`/api/leads/${leadId}/attachments`),
      ]);
      const cJson = cRes.ok ? await cRes.json() : { comments: [] };
      const kJson = kRes.ok ? await kRes.json() : { items: [] };
      const aJson = aRes.ok ? await aRes.json() : { attachments: [] };
      const items = (kJson.items || []) as { done: boolean }[];
      setSummaryByLead((prev) => ({
        ...prev,
        [leadId]: {
          comments_count: (cJson.comments || []).length,
          checklist_total: items.length,
          checklist_done: items.filter((i) => i.done).length,
          attachments_count: (aJson.attachments || []).length,
          labels: labelsJson.labels || [],
        },
      }));
    } catch {
      // best-effort
    }
  }, []);

  async function tomarLead(leadId: string) {
    setTomandoId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}/tomar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`No se pudo tomar: ${err.error || res.statusText}`);
        return;
      }
      setLeads((prev) => prev.map((l) => l.id === leadId ? ({ ...l, closer_id: session.team_member_id } as LeadWithTeam) : l));
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTomandoId(null);
    }
  }

  async function moveEtapaPolitica(leadId: string, etapa: EtapaPolitica) {
    setSavingEtapa(leadId);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? ({ ...l, etapa_politica: etapa } as LeadWithTeam) : l)));
    try {
      const res = await fetch(`/api/leads/${leadId}/etapa-politica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa }),
      });
      if (!res.ok) {
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

  async function persistKanbanOrder(leadId: string, value: number) {
    try {
      await fetch(`/api/leads/${leadId}/kanban-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanban_order: value }),
      });
    } catch {
      // best-effort: el optimistic update ya está aplicado
    }
  }

  const monthOptions = useMemo(() => getFiscalMonthOptions(12), []);

  void session;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (closerFilter !== "todos" && lead.closer_id !== closerFilter) return false;
      if (setterFilter !== "todos" && lead.setter_id !== setterFilter) return false;
      if (isPolitica && misLeadsOnly && session.team_member_id) {
        if (lead.closer_id && lead.closer_id !== session.team_member_id) return false;
      }

      if (monthFilter !== "todos" && lead.fecha_llamada) {
        const llamadaDate = parseLocalDate(lead.fecha_llamada);
        const monthStart = parseLocalDate(monthFilter);
        const monthEnd = getFiscalEnd(monthStart);
        if (llamadaDate < monthStart || llamadaDate > monthEnd) return false;
      }

      // Buscador por nombre (case-insensitive)
      if (term) {
        const name = (lead.nombre || "").toLowerCase();
        if (!name.includes(term)) return false;
      }

      // Filtro labels (al menos 1 coincidencia)
      if (labelFilter.length > 0) {
        const leadLabels = summaryByLead[lead.id]?.labels || [];
        const hasMatch = leadLabels.some((l) => labelFilter.includes(l.id));
        if (!hasMatch) return false;
      }

      return true;
    });
  }, [leads, closerFilter, setterFilter, monthFilter, isPolitica, misLeadsOnly, session.team_member_id, search, labelFilter, summaryByLead]);

  const buckets = useMemo(() => {
    const sortByOrder = (a: LeadWithTeam, b: LeadWithTeam) => {
      const ao = (a as unknown as { kanban_order?: number | null }).kanban_order ?? 1000;
      const bo = (b as unknown as { kanban_order?: number | null }).kanban_order ?? 1000;
      if (ao !== bo) return ao - bo;
      // tie-breaker: created_at desc
      return (b.created_at || "").localeCompare(a.created_at || "");
    };

    if (isPolitica) {
      const map: Record<string, LeadWithTeam[]> = { nuevo: [], caliente: [], aserrado: [], preserrado: [], cerrado: [], perdido: [] };
      for (const lead of filtered) {
        const key = classifyPolitica((lead as unknown as { etapa_politica?: EtapaPolitica }).etapa_politica);
        map[key].push(lead);
      }
      for (const k of Object.keys(map)) map[k].sort(sortByOrder);
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
    setSelectedLeadId(null);
  }

  // Drag&drop dentro de columna: calcula nuevo kanban_order entre vecinos.
  function reorderWithinColumn(colKey: string, draggedLeadId: string, targetIndex: number) {
    const colItems = buckets[colKey] || [];
    const without = colItems.filter((l) => l.id !== draggedLeadId);
    const prev = without[targetIndex - 1];
    const next = without[targetIndex];
    const prevOrder = (prev as unknown as { kanban_order?: number | null } | undefined)?.kanban_order ?? null;
    const nextOrder = (next as unknown as { kanban_order?: number | null } | undefined)?.kanban_order ?? null;
    let newOrder: number;
    if (prevOrder == null && nextOrder == null) newOrder = 1000;
    else if (prevOrder == null) newOrder = (nextOrder ?? 1000) - 1;
    else if (nextOrder == null) newOrder = (prevOrder ?? 1000) + 1;
    else newOrder = (prevOrder + nextOrder) / 2;

    setLeads((prevLeads) =>
      prevLeads.map((l) =>
        l.id === draggedLeadId ? ({ ...l, kanban_order: newOrder } as LeadWithTeam) : l
      )
    );
    persistKanbanOrder(draggedLeadId, newOrder);
  }

  const selectClass =
    "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";

  // Labels disponibles para el filtro del board (scope acorde a la vista)
  const filterableLabels = useMemo(() => {
    if (!isPolitica) return allLabels;
    return allLabels.filter((l) => l.scope === "politica" || l.scope === "all");
  }, [allLabels, isPolitica]);

  function toggleLabelFilter(id: string) {
    setLabelFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

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

      {/* Toolbar: Buscador + filtro labels + vista compacta (sólo política tiene labels populadas) */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar lead..."
          className="flex-1 min-w-[180px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]"
        />

        {filterableLabels.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowLabelMenu((v) => !v)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                labelFilter.length > 0
                  ? "bg-[var(--purple)]/20 border-[var(--purple)]/40 text-[var(--purple)]"
                  : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              🏷️ Labels {labelFilter.length > 0 && `(${labelFilter.length})`}
            </button>
            {showLabelMenu && (
              <div className="absolute z-30 right-0 mt-1 w-64 max-h-72 overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl p-1.5 space-y-1">
                {filterableLabels.map((l) => {
                  const active = labelFilter.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLabelFilter(l.id)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 ${active ? "bg-[var(--purple)]/15" : "hover:bg-[#111113]"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="flex-1 truncate">{l.nombre}</span>
                      {active && <span className="text-[10px] text-[var(--purple)]">✓</span>}
                    </button>
                  );
                })}
                {labelFilter.length > 0 && (
                  <button
                    onClick={() => setLabelFilter([])}
                    className="w-full text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] py-1 mt-1 border-t border-[var(--card-border)]"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setCompact((v) => !v)}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
            compact
              ? "bg-[var(--purple)]/20 border-[var(--purple)]/40 text-[var(--purple)]"
              : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
          title="Vista compactada"
        >
          {compact ? "📋 Compacta" : "📋 Compacta"}
        </button>
      </div>

      {/* Kanban Board — Política */}
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
                  setDraggedId(null);
                  if (!leadId) return;
                  // Si arrastran a "Cerrado", abrir modal de handoff
                  if (col.key === "cerrado") {
                    const lead = leads.find((l) => l.id === leadId);
                    if (lead) {
                      setCerrandoLead(lead);
                      return;
                    }
                  }
                  const sourceCol = classifyPolitica((leads.find((l) => l.id === leadId) as unknown as { etapa_politica?: EtapaPolitica })?.etapa_politica);
                  if (sourceCol === col.key) {
                    // Drop al final si no se especificó posición
                    reorderWithinColumn(col.key, leadId, items.length);
                    return;
                  }
                  moveEtapaPolitica(leadId, col.key);
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
                  {items.map((lead, idx) => {
                    const summary = summaryByLead[lead.id] || EMPTY_SUMMARY;
                    return (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); setDraggedId(lead.id); }}
                        onDragEnd={() => setDraggedId(null)}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const movedId = e.dataTransfer.getData("text/plain");
                          setDraggedId(null);
                          if (!movedId || movedId === lead.id) return;
                          const movedLead = leads.find((l) => l.id === movedId);
                          if (!movedLead) return;
                          const sourceCol = classifyPolitica((movedLead as unknown as { etapa_politica?: EtapaPolitica }).etapa_politica);
                          if (sourceCol === col.key) {
                            // Mismo columna → reordenar antes de este card
                            reorderWithinColumn(col.key, movedId, idx);
                          } else {
                            // Mover entre columnas (modal si "cerrado")
                            if (col.key === "cerrado") {
                              setCerrandoLead(movedLead);
                              return;
                            }
                            moveEtapaPolitica(movedId, col.key);
                          }
                        }}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`w-full text-left bg-[#0d0d0f] border border-[var(--card-border)] rounded-lg ${compact ? "p-2" : "p-3"} hover:border-[var(--purple)]/40 hover:bg-[#111113] transition-all cursor-grab active:cursor-grabbing ${draggedId === lead.id ? "opacity-40" : ""} ${savingEtapa === lead.id ? "ring-1 ring-[var(--purple)]/60" : ""}`}
                      >
                        {/* Labels chips */}
                        {!compact && summary.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {summary.labels.slice(0, 3).map((l) => (
                              <span
                                key={l.id}
                                className="text-[9px] px-1.5 py-0.5 rounded border leading-none"
                                style={{ backgroundColor: `${l.color}22`, borderColor: `${l.color}55`, color: l.color }}
                                title={l.nombre}
                              >
                                {l.nombre}
                              </span>
                            ))}
                            {summary.labels.length > 3 && (
                              <span className="text-[9px] text-[var(--muted)]">+{summary.labels.length - 3}</span>
                            )}
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{lead.nombre || "Sin nombre"}</p>
                          <LeadScoreBadge score={lead.lead_score} />
                        </div>

                        {compact && summary.labels.length > 0 && (
                          <span
                            className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded border leading-none"
                            style={{
                              backgroundColor: `${summary.labels[0].color}22`,
                              borderColor: `${summary.labels[0].color}55`,
                              color: summary.labels[0].color,
                            }}
                          >
                            {summary.labels[0].nombre}
                          </span>
                        )}

                        {!compact && (
                          <>
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

                            {/* Indicadores Trello-like */}
                            {(summary.comments_count > 0 || summary.checklist_total > 0 || summary.attachments_count > 0) && (
                              <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--muted)]">
                                {summary.checklist_total > 0 && (
                                  <span title="Checklist">
                                    ✓ {summary.checklist_done}/{summary.checklist_total}
                                  </span>
                                )}
                                {summary.comments_count > 0 && (
                                  <span title="Comentarios">💬 {summary.comments_count}</span>
                                )}
                                {summary.attachments_count > 0 && (
                                  <span title="Adjuntos">📎 {summary.attachments_count}</span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
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
              <div className={`rounded-t-lg px-3 py-2 ${col.headerColor} border ${col.borderColor} border-b-0`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.title}</span>
                  <span className="text-xs font-mono opacity-80">{items.length}</span>
                </div>
              </div>

              <div className={`flex-1 border ${col.borderColor} border-t-0 rounded-b-lg bg-[var(--card-bg)]/30 p-2 space-y-2 max-h-[70vh] overflow-y-auto`}>
                {items.length === 0 && (
                  <p className="text-xs text-[var(--muted)] text-center py-6">Sin leads</p>
                )}
                {items.map((lead) => {
                  const summary = summaryByLead[lead.id] || EMPTY_SUMMARY;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`w-full text-left bg-[#0d0d0f] border border-[var(--card-border)] rounded-lg ${compact ? "p-2" : "p-3"} hover:border-[var(--purple)]/40 hover:bg-[#111113] transition-all cursor-pointer`}
                    >
                      {!compact && summary.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {summary.labels.slice(0, 3).map((l) => (
                            <span
                              key={l.id}
                              className="text-[9px] px-1.5 py-0.5 rounded border leading-none"
                              style={{ backgroundColor: `${l.color}22`, borderColor: `${l.color}55`, color: l.color }}
                              title={l.nombre}
                            >
                              {l.nombre}
                            </span>
                          ))}
                          {summary.labels.length > 3 && (
                            <span className="text-[9px] text-[var(--muted)]">+{summary.labels.length - 3}</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{lead.nombre || "Sin nombre"}</p>
                        <LeadScoreBadge score={lead.lead_score} />
                      </div>

                      {compact && summary.labels.length > 0 && (
                        <span
                          className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded border leading-none"
                          style={{
                            backgroundColor: `${summary.labels[0].color}22`,
                            borderColor: `${summary.labels[0].color}55`,
                            color: summary.labels[0].color,
                          }}
                        >
                          {summary.labels[0].nombre}
                        </span>
                      )}

                      {!compact && (
                        <>
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

                          {(summary.comments_count > 0 || summary.checklist_total > 0 || summary.attachments_count > 0) && (
                            <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--muted)]">
                              {summary.checklist_total > 0 && (
                                <span title="Checklist">✓ {summary.checklist_done}/{summary.checklist_total}</span>
                              )}
                              {summary.comments_count > 0 && (
                                <span title="Comentarios">💬 {summary.comments_count}</span>
                              )}
                              {summary.attachments_count > 0 && (
                                <span title="Adjuntos">📎 {summary.attachments_count}</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
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
          isPolitica={isPolitica}
          onClose={() => setSelectedLeadId(null)}
          onEstadoChange={handleEstadoChange}
          onCardDataChange={refreshLeadSummary}
        />
      )}

      {/* Modal handoff a Hugo cuando se cierra un deal política */}
      {cerrandoLead && (
        <CerrarPoliticaModal
          leadId={cerrandoLead.id}
          leadNombre={cerrandoLead.nombre || "Sin nombre"}
          ticketSugerido={cerrandoLead.ticket_total || undefined}
          onClose={() => setCerrandoLead(null)}
          onSuccess={() => {
            setLeads((prev) => prev.map((l) => l.id === cerrandoLead.id ? ({ ...l, etapa_politica: "cerrado", estado: "cerrado" } as LeadWithTeam) : l));
            setCerrandoLead(null);
          }}
        />
      )}
    </div>
  );
}
