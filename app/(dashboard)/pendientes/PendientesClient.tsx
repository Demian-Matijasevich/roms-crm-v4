"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthSession } from "@/lib/types";

interface LeadRow {
  id: string;
  nombre: string | null;
  telefono: string | null;
  instagram: string | null;
  estado: string | null;
  ticket_total: number | null;
  fecha_llamada: string | null;
  fecha_agendado: string | null;
  closer_id: string | null;
  setter_id: string | null;
  reporte_general: string | null;
  contexto_setter: string | null;
  programa_pitcheado: string | null;
  plan_pago: string | null;
}
type Person = { id: string; nombre: string };

interface Props {
  leads: LeadRow[];
  closers: Person[];
  setters: Person[];
  session: AuthSession;
}

type Missing = "closer" | "setter" | "reporte" | "contexto";

function missingOf(l: LeadRow): Missing[] {
  const out: Missing[] = [];
  if (!l.closer_id) out.push("closer");
  if (!l.setter_id) out.push("setter");
  if (!l.reporte_general || l.reporte_general.trim() === "") out.push("reporte");
  if (!l.contexto_setter || l.contexto_setter.trim() === "") out.push("contexto");
  return out;
}

const TAGS: Record<Missing, { label: string; color: string }> = {
  closer: { label: "Falta closer", color: "bg-red-500/15 text-red-300 border-red-500/30" },
  setter: { label: "Falta setter", color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  reporte: { label: "Falta reporte", color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  contexto: { label: "Falta contexto", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
};

export default function PendientesClient({ leads: initial, closers, setters, session }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [filter, setFilter] = useState<"todos" | Missing>("todos");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<LeadRow>>>({});

  const filtered = useMemo(() => {
    if (filter === "todos") return leads;
    return leads.filter((l) => missingOf(l).includes(filter));
  }, [leads, filter]);

  const counts = useMemo(() => {
    const c = { closer: 0, setter: 0, reporte: 0, contexto: 0 };
    for (const l of leads) {
      const m = missingOf(l);
      for (const k of m) c[k]++;
    }
    return c;
  }, [leads]);

  function update(id: string, patch: Partial<LeadRow>) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(lead: LeadRow) {
    const patch = draft[lead.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSavingId(lead.id);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Error al guardar: ${j.error || res.statusText}`);
        return;
      }
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)));
      setDraft((d) => {
        const next = { ...d };
        delete next[lead.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  }

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—");

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mis pendientes</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Leads {session.is_admin ? "del equipo" : "tuyos"} con campos clave vacíos. Completá y guardá.
        </p>
      </div>

      {/* Filtros pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter("todos")}
          className={`px-3 py-1.5 rounded-full text-sm border transition ${
            filter === "todos"
              ? "bg-white/10 text-white border-white/20"
              : "text-[var(--muted)] border-[var(--card-border)] hover:text-white"
          }`}
        >
          Todos · {leads.length}
        </button>
        {(Object.keys(TAGS) as Missing[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${
              filter === k ? TAGS[k].color : `text-[var(--muted)] border-[var(--card-border)] hover:text-white`
            }`}
          >
            {TAGS[k].label} · {counts[k]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-12 text-center">
          <div className="text-4xl mb-2">{"\u{1F389}"}</div>
          <p className="text-white font-medium">Sin pendientes</p>
          <p className="text-sm text-[var(--muted)]">Toda la data de tus leads está al día.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((l) => {
            const miss = missingOf(l);
            const d = draft[l.id] || {};
            const closerVal = (d.closer_id ?? l.closer_id) || "";
            const setterVal = (d.setter_id ?? l.setter_id) || "";
            const reporteVal = (d.reporte_general ?? l.reporte_general) || "";
            const contextoVal = (d.contexto_setter ?? l.contexto_setter) || "";
            const dirty = Object.keys(d).length > 0;
            return (
              <div
                key={l.id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-white font-semibold truncate">{l.nombre || "Sin nombre"}</h3>
                      {miss.map((k) => (
                        <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded border ${TAGS[k].color}`}>
                          {TAGS[k].label}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1 flex flex-wrap gap-3">
                      {l.instagram && <span>{"@" + l.instagram}</span>}
                      {l.telefono && <span>{l.telefono}</span>}
                      <span>{l.estado || "sin estado"}</span>
                      {l.ticket_total && <span className="text-green-300">${l.ticket_total}</span>}
                      <span>Llamada: {fmt(l.fecha_llamada || l.fecha_agendado)}</span>
                    </div>
                  </div>
                  <a
                    href={`/llamadas/${l.id}/estado-cuenta`}
                    className="text-xs px-2 py-1 rounded border border-[var(--card-border)] text-[var(--muted)] hover:text-white whitespace-nowrap"
                  >
                    Ver completo →
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Closer</label>
                    <select
                      value={closerVal}
                      onChange={(e) => update(l.id, { closer_id: e.target.value || null })}
                      className="w-full bg-white/5 border border-[var(--card-border)] rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="">— sin asignar —</option>
                      {closers.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Setter</label>
                    <select
                      value={setterVal}
                      onChange={(e) => update(l.id, { setter_id: e.target.value || null })}
                      className="w-full bg-white/5 border border-[var(--card-border)] rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="">— sin asignar —</option>
                      {setters.map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Reporte general de la llamada</label>
                    <textarea
                      value={reporteVal}
                      onChange={(e) => update(l.id, { reporte_general: e.target.value })}
                      rows={2}
                      placeholder="¿Qué pasó en la llamada? Objeción, próximo paso, observaciones..."
                      className="w-full bg-white/5 border border-[var(--card-border)] rounded-md px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Contexto del setter</label>
                    <textarea
                      value={contextoVal}
                      onChange={(e) => update(l.id, { contexto_setter: e.target.value })}
                      rows={2}
                      placeholder="Origen, intención, qué pidió, info útil para el closer..."
                      className="w-full bg-white/5 border border-[var(--card-border)] rounded-md px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => save(l)}
                    disabled={!dirty || savingId === l.id}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                      dirty
                        ? "bg-[var(--purple)] text-white hover:opacity-90"
                        : "bg-white/5 text-[var(--muted)] cursor-not-allowed"
                    }`}
                  >
                    {savingId === l.id ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => router.refresh()}
          className="text-xs px-3 py-1.5 rounded-lg text-[var(--muted)] hover:text-white border border-[var(--card-border)]"
        >
          Refrescar
        </button>
      </div>
    </div>
  );
}
