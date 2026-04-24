"use client";

import { useState, useMemo } from "react";

interface Lead {
  id: string;
  nombre: string;
  instagram: string | null;
  email: string | null;
  telefono: string | null;
  setter_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: string;
  sheets_row_index: number | null;
  fuente: string | null;
  is_duplicado?: boolean;
  dup_reason?: string | null;
}

interface Props {
  leads: Lead[];
  setters: Array<{ id: string; nombre: string }>;
  currentUser: { id: string; nombre: string; isAdmin: boolean; isSetter: boolean };
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente: "bg-[var(--yellow)]/20 text-[var(--yellow)]",
  cerrado: "bg-[var(--green)]/20 text-[var(--green)]",
  adentro_seguimiento: "bg-[var(--green)]/20 text-[var(--green)]",
  seguimiento: "bg-[var(--purple)]/20 text-[var(--purple-light)]",
  no_cierre: "bg-white/10 text-[var(--muted)]",
  cancelada: "bg-[var(--red)]/10 text-[var(--red)]",
  no_show: "bg-[var(--red)]/10 text-[var(--red)]",
  reprogramada: "bg-[var(--yellow)]/10 text-[var(--yellow)]",
};

function todayISO() { return new Date().toISOString().split("T")[0]; }
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function LeadsSinSetterClient({ leads, setters, currentUser }: Props) {
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);
  const [filterFrom, setFilterFrom] = useState<string>(daysAgoISO(30));
  const [filterTo, setFilterTo] = useState<string>(todayISO());
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSetter, setBulkSetter] = useState<string>("");
  const [search, setSearch] = useState("");
  // pending assignments per lead (not yet saved)
  const [pending, setPending] = useState<Record<string, string>>({});
  const [onlyDuplicados, setOnlyDuplicados] = useState(false);

  const filtered = useMemo(() => {
    return localLeads.filter((l) => {
      const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
      if (f && f < filterFrom) return false;
      if (f && f > filterTo) return false;
      if (filterEstado !== "todos" && l.estado !== filterEstado) return false;
      if (onlyDuplicados && !l.is_duplicado) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!l.nombre.toLowerCase().includes(q) && !(l.instagram || "").toLowerCase().includes(q) && !(l.email || "").toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const fa = (a.fecha_agendado || a.fecha_llamada || "");
      const fb = (b.fecha_agendado || b.fecha_llamada || "");
      return fb.localeCompare(fa);
    });
  }, [localLeads, filterFrom, filterTo, filterEstado, search, onlyDuplicados]);

  const totalDuplicados = useMemo(() => localLeads.filter((l) => l.is_duplicado).length, [localLeads]);

  const byEstado = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of filtered) map[l.estado] = (map[l.estado] || 0) + 1;
    return map;
  }, [filtered]);

  async function assignSetter(leadId: string, setterId: string) {
    setSavingId(leadId);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, setter_id: setterId || null }),
      });
      const json = await res.json();
      if (json.ok) {
        // Remove from list (asignado, ya no sin setter)
        setLocalLeads((prev) => prev.filter((l) => l.id !== leadId));
        setSelected((prev) => {
          const n = new Set(prev);
          n.delete(leadId);
          return n;
        });
        setPending((p) => {
          const n = { ...p };
          delete n[leadId];
          return n;
        });
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingId(null);
    }
  }

  async function bulkAssign() {
    if (!bulkSetter || selected.size === 0) return;
    if (!confirm(`Asignar ${selected.size} leads a este setter?`)) return;
    const ids = [...selected];
    let done = 0;
    for (const id of ids) {
      await assignSetter(id, bulkSetter);
      done++;
    }
    alert(`${done} leads asignados`);
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function copyList() {
    const lines = [
      `📋 LEADS SIN SETTER ${filterFrom} a ${filterTo}`,
      `Total: ${filtered.length}`,
      "",
      "Lista (fecha | nombre | @ig | estado | row):",
      ...filtered.map((l) => {
        const fecha = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
        const ig = l.instagram || "—";
        return `${fecha} | ${l.nombre} | ${ig} | ${l.estado} | row ${l.sheets_row_index || "—"}`;
      }),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    alert(`Copiado al portapapeles (${filtered.length} leads)`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leads Sin Setter</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Leads sin atribución de setter (ni directo ni por utm_medium). Asignales un setter o compartí la lista.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Desde</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Hasta</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Estado</label>
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white">
            <option value="todos">Todos</option>
            {Object.keys(byEstado).sort().map((est) => (
              <option key={est} value={est}>{est} ({byEstado[est]})</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-[var(--muted)] block mb-1">Buscar (nombre / IG / email)</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={onlyDuplicados} onChange={(e) => setOnlyDuplicados(e.target.checked)}
            className="accent-[var(--yellow)]" />
          <span className="text-xs text-white">⚠️ Solo duplicados <span className="text-[var(--muted)]">({totalDuplicados})</span></span>
        </label>
        <button onClick={copyList}
          className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg text-sm font-medium">
          📋 Copiar lista
        </button>
      </div>

      {/* Bulk assign */}
      {selected.size > 0 && (
        <div className="bg-[var(--purple)]/10 border border-[var(--purple)]/40 rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-white font-medium">{selected.size} seleccionados</span>
          {currentUser.isSetter && !currentUser.isAdmin ? (
            <button
              onClick={async () => {
                if (!confirm(`Reclamar ${selected.size} leads como tuyos?`)) return;
                for (const id of [...selected]) await assignSetter(id, currentUser.id);
              }}
              className="bg-[var(--green)] hover:bg-[var(--green)]/80 text-white px-4 py-2 rounded-lg text-sm font-medium">
              👤 Reclamar todos como míos
            </button>
          ) : (
            <>
              <select value={bulkSetter} onChange={(e) => setBulkSetter(e.target.value)}
                className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Elegí setter...</option>
                {setters.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <button onClick={bulkAssign} disabled={!bulkSetter}
                className="bg-[var(--green)] hover:bg-[var(--green)]/80 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Asignar
              </button>
            </>
          )}
          <button onClick={() => setSelected(new Set())}
            className="text-[var(--muted)] hover:text-white text-sm px-2 py-2">
            Cancelar
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-4 py-2">
          <span className="text-xs text-[var(--muted)]">Total filtrado:</span>
          <span className="text-lg font-bold text-white ml-2">{filtered.length}</span>
        </div>
        {Object.entries(byEstado).sort((a, b) => b[1] - a[1]).map(([est, n]) => (
          <div key={est} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2">
            <span className="text-xs text-[var(--muted)]">{est}:</span>
            <span className="text-sm font-bold text-white ml-2">{n}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-[var(--muted)]">
            {localLeads.length === 0 ? "✨ No hay leads sin setter" : "Sin resultados con los filtros actuales"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--background)] text-left text-[var(--muted)] text-xs uppercase">
                  <th className="py-3 px-3 w-10">
                    <input type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="accent-[var(--purple)]" />
                  </th>
                  <th className="py-3 px-3">Fecha Agenda</th>
                  <th className="py-3 px-3">Fecha Llamada</th>
                  <th className="py-3 px-3">Nombre</th>
                  <th className="py-3 px-3">@IG</th>
                  <th className="py-3 px-3">Email</th>
                  <th className="py-3 px-3">Fuente</th>
                  <th className="py-3 px-3">Asignar a</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const fechaAg = (l.fecha_agendado || "").split("T")[0];
                  const fechaLl = (l.fecha_llamada || "").split("T")[0];
                  return (
                    <tr
                      key={l.id}
                      onClick={(e) => {
                        // Don't toggle when clicking on interactive elements (button, select, input)
                        const target = e.target as HTMLElement;
                        if (target.closest("button, select, input, a")) return;
                        toggleOne(l.id);
                      }}
                      className={`border-t border-[var(--card-border)]/30 hover:bg-white/5 cursor-pointer transition-colors ${selected.has(l.id) ? "bg-[var(--purple)]/10" : ""}`}
                    >
                      <td className="py-3 px-3">
                        <input type="checkbox"
                          checked={selected.has(l.id)}
                          onChange={() => toggleOne(l.id)}
                          className="accent-[var(--purple)]" />
                      </td>
                      <td className="py-3 px-3 text-[var(--muted)]">{fechaAg || "—"}</td>
                      <td className="py-3 px-3 text-[var(--muted)]">{fechaLl || "—"}</td>
                      <td className="py-3 px-3 text-white font-medium">
                        {l.nombre}
                        {l.is_duplicado && (
                          <span
                            className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-[var(--yellow)]/20 text-[var(--yellow)] font-bold"
                            title={`Duplicado por ${l.dup_reason}`}
                          >
                            ⚠️ DUP
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[var(--muted)]">{l.instagram || "—"}</td>
                      <td className="py-3 px-3 text-[var(--muted)] max-w-[180px] truncate" title={l.email || ""}>{l.email || "—"}</td>
                      <td className="py-3 px-3 text-[var(--muted)] text-xs">{l.fuente || l.utm_source || "—"}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {currentUser.isSetter && !currentUser.isAdmin && (
                            <button
                              type="button"
                              onClick={() => setPending((p) => ({ ...p, [l.id]: currentUser.id }))}
                              className={`text-[11px] px-2 py-1 rounded ${pending[l.id] === currentUser.id ? "bg-[var(--purple)] text-white" : "bg-white/5 text-[var(--muted)] hover:bg-[var(--purple)]/20"}`}
                              title="Marcar como mío"
                            >
                              👤 Mío
                            </button>
                          )}
                          <select
                            disabled={savingId === l.id}
                            value={pending[l.id] || ""}
                            onChange={(e) => setPending((p) => ({ ...p, [l.id]: e.target.value }))}
                            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1 text-xs text-white"
                          >
                            <option value="">— setter —</option>
                            {setters.map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!pending[l.id] || savingId === l.id}
                            onClick={() => assignSetter(l.id, pending[l.id])}
                            className="text-[11px] px-2 py-1 rounded bg-[var(--green)] text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {savingId === l.id ? "..." : "Guardar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
