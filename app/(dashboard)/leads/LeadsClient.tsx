"use client";

import { useState, useMemo } from "react";
import type { LeadRow } from "./page";

interface Props {
  leads: LeadRow[];
  setters: Array<{ id: string; nombre: string }>;
  closers: Array<{ id: string; nombre: string }>;
}

const ESTADOS = [
  "pendiente", "no_show", "cancelada", "reprogramada", "seguimiento",
  "no_calificado", "no_cierre", "reserva", "cerrado",
  "adentro_seguimiento", "broke_cancelado",
];

const ESTADO_COLORS: Record<string, string> = {
  pendiente: "bg-[var(--yellow)]/20 text-[var(--yellow)]",
  cerrado: "bg-[var(--green)]/20 text-[var(--green)]",
  adentro_seguimiento: "bg-[var(--green)]/20 text-[var(--green)]",
  seguimiento: "bg-[var(--purple)]/20 text-[var(--purple-light)]",
  reserva: "bg-[var(--purple)]/20 text-[var(--purple-light)]",
  no_cierre: "bg-white/10 text-[var(--muted)]",
  no_calificado: "bg-white/10 text-[var(--muted)]",
  cancelada: "bg-[var(--red)]/10 text-[var(--red)]",
  no_show: "bg-[var(--red)]/10 text-[var(--red)]",
  reprogramada: "bg-[var(--yellow)]/10 text-[var(--yellow)]",
  broke_cancelado: "bg-[var(--red)]/10 text-[var(--red)]",
};

const PROGRAMAS = ["roms_7", "consultoria", "omnipresencia", "multicuentas"];

function todayISO() { return new Date().toISOString().split("T")[0]; }
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function LeadsClient({ leads, setters, closers }: Props) {
  const [localLeads, setLocalLeads] = useState<LeadRow[]>(leads);

  const [fDesde, setFDesde] = useState(daysAgoISO(30));
  const [fHasta, setFHasta] = useState(todayISO());
  const [fEstado, setFEstado] = useState("todos");
  const [fSetter, setFSetter] = useState("todos");
  const [fCloser, setFCloser] = useState("todos");
  const [fUtmSource, setFUtmSource] = useState("todos");
  const [search, setSearch] = useState("");
  const [sinSetterOnly, setSinSetterOnly] = useState(false);

  const filtered = useMemo(() => {
    return localLeads.filter((l) => {
      const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
      if (f && f < fDesde) return false;
      if (f && f > fHasta) return false;
      if (fEstado !== "todos" && l.estado !== fEstado) return false;
      if (fSetter === "sin") { if (l.setter_id) return false; }
      else if (fSetter !== "todos" && l.setter_id !== fSetter) return false;
      if (fCloser === "sin") { if (l.closer_id) return false; }
      else if (fCloser !== "todos" && l.closer_id !== fCloser) return false;
      if (fUtmSource === "sin") { if (l.utm_source) return false; }
      else if (fUtmSource !== "todos" && (l.utm_source || "").toLowerCase() !== fUtmSource) return false;
      if (sinSetterOnly && l.setter_id) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(l.nombre || "").toLowerCase().includes(q) &&
          !(l.instagram || "").toLowerCase().includes(q) &&
          !(l.email || "").toLowerCase().includes(q) &&
          !(l.telefono || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    }).sort((a, b) => {
      const fa = (a.fecha_agendado || a.fecha_llamada || "");
      const fb = (b.fecha_agendado || b.fecha_llamada || "");
      return fb.localeCompare(fa);
    });
  }, [localLeads, fDesde, fHasta, fEstado, fSetter, fCloser, fUtmSource, search, sinSetterOnly]);

  const utmSources = useMemo(() => {
    const set = new Set<string>();
    for (const l of localLeads) if (l.utm_source) set.add(l.utm_source.toLowerCase());
    return [...set].sort();
  }, [localLeads]);

  async function updateField(leadId: string, field: string, value: string | number | null) {
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocalLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, [field]: value } : l)));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function teamName(id: string | null, list: Array<{ id: string; nombre: string }>): string {
    if (!id) return "—";
    return list.find((t) => t.id === id)?.nombre || "?";
  }

  void teamName;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Vista global de todos los leads. Todo editable — cambios guardan al salir del campo.
          </p>
        </div>
        <span className="text-sm text-[var(--muted)]">Mostrando <span className="text-white font-bold">{filtered.length}</span> de {localLeads.length}</span>
      </div>

      {/* Filters */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Desde</label>
          <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Hasta</label>
          <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Estado</label>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            {ESTADOS.map((e) => (<option key={e} value={e}>{e}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Setter</label>
          <select value={fSetter} onChange={(e) => setFSetter(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            <option value="sin">Sin setter</option>
            {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Closer</label>
          <select value={fCloser} onChange={(e) => setFCloser(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            <option value="sin">Sin closer</option>
            {closers.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">UTM Source</label>
          <select value={fUtmSource} onChange={(e) => setFUtmSource(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            <option value="sin">Sin UTM</option>
            {utmSources.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-[var(--muted)] block mb-1">Buscar (nombre / IG / email / tel)</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white" />
        </div>
        <button
          onClick={() => { setFDesde(daysAgoISO(30)); setFHasta(todayISO()); setFEstado("todos"); setFSetter("todos"); setFCloser("todos"); setFUtmSource("todos"); setSearch(""); setSinSetterOnly(false); }}
          className="text-xs text-[var(--muted)] hover:text-white underline pb-1.5"
        >
          Limpiar
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead>
              <tr className="bg-[var(--background)] text-left text-[var(--muted)] text-[10px] uppercase">
                <th className="py-2 px-2 w-[80px]">Fecha ag.</th>
                <th className="py-2 px-2 w-[80px]">Fecha ll.</th>
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">@IG</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Tel</th>
                <th className="py-2 px-2 w-[110px]">Estado</th>
                <th className="py-2 px-2 w-[100px]">Setter</th>
                <th className="py-2 px-2 w-[100px]">Closer</th>
                <th className="py-2 px-2 w-[80px]">UTM src</th>
                <th className="py-2 px-2 w-[80px]">UTM med</th>
                <th className="py-2 px-2 w-[110px]">Programa</th>
                <th className="py-2 px-2 text-right w-[90px]">Ticket</th>
                <th className="py-2 px-2 w-[50px]">Row</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="py-12 text-center text-[var(--muted)]">Sin resultados</td></tr>
              ) : filtered.map((l) => {
                const estadoCls = ESTADO_COLORS[l.estado] || "bg-white/10 text-[var(--muted)]";
                return (
                  <tr key={l.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                    <td className="py-1 px-2">
                      <input type="date" defaultValue={l.fecha_agendado?.split("T")[0] || ""}
                        onBlur={(e) => { const v = e.target.value || null; if (v !== (l.fecha_agendado?.split("T")[0] || null)) updateField(l.id, "fecha_agendado", v ? `${v}T00:00:00` : null); }}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none w-[95px]" />
                    </td>
                    <td className="py-1 px-2">
                      <input type="date" defaultValue={l.fecha_llamada?.split("T")[0] || ""}
                        onBlur={(e) => { const v = e.target.value || null; if (v !== (l.fecha_llamada?.split("T")[0] || null)) updateField(l.id, "fecha_llamada", v ? `${v}T00:00:00` : null); }}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none w-[95px]" />
                    </td>
                    <td className="py-1 px-2">
                      <input type="text" defaultValue={l.nombre}
                        onBlur={(e) => { if (e.target.value !== l.nombre) updateField(l.id, "nombre", e.target.value); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-white font-medium focus:outline-none" />
                    </td>
                    <td className="py-1 px-2">
                      <input type="text" defaultValue={l.instagram || ""}
                        onBlur={(e) => { if (e.target.value !== (l.instagram || "")) updateField(l.id, "instagram", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-1 px-2">
                      <input type="email" defaultValue={l.email || ""}
                        onBlur={(e) => { if (e.target.value !== (l.email || "")) updateField(l.id, "email", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-1 px-2">
                      <input type="text" defaultValue={l.telefono || ""}
                        onBlur={(e) => { if (e.target.value !== (l.telefono || "")) updateField(l.id, "telefono", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-1 px-2">
                      <select defaultValue={l.estado}
                        onChange={(e) => updateField(l.id, "estado", e.target.value)}
                        className={`bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[10px] font-medium focus:outline-none ${estadoCls}`}>
                        {ESTADOS.map((e) => (<option key={e} value={e}>{e}</option>))}
                      </select>
                    </td>
                    <td className="py-1 px-2">
                      <select defaultValue={l.setter_id || ""}
                        onChange={(e) => updateField(l.id, "setter_id", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                        <option value="">—</option>
                        {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
                      </select>
                    </td>
                    <td className="py-1 px-2">
                      <select defaultValue={l.closer_id || ""}
                        onChange={(e) => updateField(l.id, "closer_id", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                        <option value="">—</option>
                        {closers.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                      </select>
                    </td>
                    <td className="py-1 px-2">
                      <input type="text" defaultValue={l.utm_source || ""}
                        onBlur={(e) => { if (e.target.value !== (l.utm_source || "")) updateField(l.id, "utm_source", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-1 px-2">
                      <input type="text" defaultValue={l.utm_medium || ""}
                        onBlur={(e) => { if (e.target.value !== (l.utm_medium || "")) updateField(l.id, "utm_medium", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-1 px-2">
                      <select defaultValue={l.programa_pitcheado || ""}
                        onChange={(e) => updateField(l.id, "programa_pitcheado", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                        <option value="">—</option>
                        {PROGRAMAS.map((p) => (<option key={p} value={p}>{p}</option>))}
                      </select>
                    </td>
                    <td className="py-1 px-2 text-right">
                      <input type="number" step={100} defaultValue={l.ticket_total || 0}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== (l.ticket_total || 0)) updateField(l.id, "ticket_total", v); }}
                        className="w-20 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right text-[var(--green)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-1 px-2 text-[var(--muted)] text-[11px] text-center">{l.sheets_row_index || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
