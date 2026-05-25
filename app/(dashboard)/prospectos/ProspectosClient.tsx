"use client";

import { useState, useMemo } from "react";
import type { AuthSession } from "@/lib/types";
import type { ProspectoRow, TeamMemberRow } from "./page";

interface Props {
  prospectos: ProspectoRow[];
  team: TeamMemberRow[];
  session: AuthSession;
}

type EstadoFilter = "todos" | ProspectoRow["estado"];

const ESTADO_LABELS: Record<ProspectoRow["estado"], string> = {
  nuevo: "Nuevo",
  intentado: "Intentado",
  respondio: "Respondió",
  agendado: "Agendado",
  descartado: "Descartado",
};

const ESTADO_COLORS: Record<ProspectoRow["estado"], string> = {
  nuevo: "bg-blue-500/10 border-blue-500/40 text-blue-300",
  intentado: "bg-amber-500/10 border-amber-500/40 text-amber-300",
  respondio: "bg-[var(--green)]/10 border-[var(--green)]/40 text-[var(--green)]",
  agendado: "bg-[var(--purple)]/10 border-[var(--purple)]/40 text-[var(--purple-light)]",
  descartado: "bg-[var(--muted)]/10 border-[var(--muted)]/40 text-[var(--muted)]",
};

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";

export default function ProspectosClient({ prospectos: initial, team, session }: Props) {
  const isAdmin = !!session.is_admin;
  const me = session.team_member_id;

  const [local, setLocal] = useState<ProspectoRow[]>(initial);
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [scopeFilter, setScopeFilter] = useState<"mios" | "todos">(isAdmin ? "todos" : "mios");
  const [search, setSearch] = useState("");
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  // Bulk add form state
  const [bulkText, setBulkText] = useState("");
  const [bulkOrigen, setBulkOrigen] = useState("");
  const [bulkEtiquetas, setBulkEtiquetas] = useState("");
  const [bulkAsignado, setBulkAsignado] = useState(me);
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = useMemo(() => {
    let arr = local;
    if (scopeFilter === "mios") arr = arr.filter((p) => p.asignado_a === me);
    if (estadoFilter !== "todos") arr = arr.filter((p) => p.estado === estadoFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(q) ||
          p.telefono.toLowerCase().includes(q) ||
          (p.instagram || "").toLowerCase().includes(q) ||
          (p.notas || "").toLowerCase().includes(q) ||
          p.etiquetas.some((e) => e.toLowerCase().includes(q))
      );
    }
    return arr;
  }, [local, scopeFilter, estadoFilter, search, me]);

  const countsByEstado = useMemo(() => {
    const scoped = scopeFilter === "mios" ? local.filter((p) => p.asignado_a === me) : local;
    const c: Record<EstadoFilter, number> = {
      todos: scoped.length,
      nuevo: 0,
      intentado: 0,
      respondio: 0,
      agendado: 0,
      descartado: 0,
    };
    for (const p of scoped) c[p.estado]++;
    return c;
  }, [local, scopeFilter, me]);

  async function updateProspecto(id: string, patch: Partial<ProspectoRow>) {
    const res = await fetch("/api/prospectos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (json.ok) {
      setLocal((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } as ProspectoRow : p)));
    } else {
      alert("Error: " + (json.error || "desconocido"));
    }
  }

  async function deleteProspecto(id: string, tel: string) {
    if (!confirm(`¿Borrar prospecto ${tel}?`)) return;
    const res = await fetch(`/api/prospectos?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setLocal((prev) => prev.filter((p) => p.id !== id));
    else alert("Error: " + (json.error || ""));
  }

  async function handleBulkAdd(e: React.FormEvent) {
    e.preventDefault();
    const tels = bulkText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (tels.length === 0) {
      alert("Pega al menos un teléfono (uno por línea)");
      return;
    }
    setBulkLoading(true);
    try {
      const etiquetas = bulkEtiquetas
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      const res = await fetch("/api/prospectos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefonos: tels,
          origen: bulkOrigen || undefined,
          etiquetas: etiquetas.length ? etiquetas : undefined,
          asignado_a: bulkAsignado || me,
        }),
      });
      const json = await res.json();
      if (json.ok && json.prospectos) {
        const teamMap = new Map(team.map((t) => [t.id, t.nombre]));
        const newRows: ProspectoRow[] = json.prospectos.map((p: ProspectoRow) => ({
          ...p,
          asignado_nombre: p.asignado_a ? teamMap.get(p.asignado_a) || null : null,
        }));
        setLocal((prev) => [...newRows, ...prev]);
        setBulkText("");
        setBulkOrigen("");
        setBulkEtiquetas("");
        setShowBulkAdd(false);
      } else {
        alert("Error: " + (json.error || ""));
      }
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Prospectos</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Cargá números de teléfono y hacé trazabilidad antes de agendar la llamada.
          </p>
        </div>
        <button
          onClick={() => setShowBulkAdd(true)}
          className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Cargar números
        </button>
      </div>

      {/* Scope filter (admin) */}
      {isAdmin && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Vista:</span>
          {(["mios", "todos"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={`px-3 py-1 rounded-md border text-xs transition-colors ${
                scopeFilter === s
                  ? "border-[var(--purple)] bg-[var(--purple)]/15 text-[var(--purple-light)]"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
              }`}
            >
              {s === "mios" ? "Mis prospectos" : "Todos"}
            </button>
          ))}
        </div>
      )}

      {/* Estado chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["todos", "nuevo", "intentado", "respondio", "agendado", "descartado"] as EstadoFilter[]).map((e) => (
          <button
            key={e}
            onClick={() => setEstadoFilter(e)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              estadoFilter === e
                ? "border-[var(--purple)] bg-[var(--purple)]/15 text-[var(--purple-light)]"
                : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
            }`}
          >
            {e === "todos" ? "Todos" : ESTADO_LABELS[e]}
            <span className="ml-1.5 text-[10px] opacity-70">({countsByEstado[e]})</span>
          </button>
        ))}
        <input
          type="text"
          placeholder="🔍 Buscar nombre / tel / IG / notas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto bg-[var(--background)] border border-[var(--card-border)] rounded-md px-3 py-1.5 text-xs text-white min-w-[240px]"
        />
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)] text-sm">
            No hay prospectos con esos filtros. {scopeFilter === "mios" && "Probá cambiar a 'Todos' o cargar nuevos números."}
          </div>
        ) : (
          filtered.map((p) => (
            <ProspectoCard
              key={p.id}
              prospecto={p}
              team={team}
              isAdmin={isAdmin}
              onUpdate={(patch) => updateProspecto(p.id, patch)}
              onDelete={() => deleteProspecto(p.id, p.telefono)}
            />
          ))
        )}
      </div>

      {/* Bulk add modal */}
      {showBulkAdd && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowBulkAdd(false)}
        >
          <form
            onSubmit={handleBulkAdd}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-lg space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Cargar números</h2>
              <button type="button" onClick={() => setShowBulkAdd(false)} className="text-[var(--muted)] hover:text-white">
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">
                Teléfonos (uno por línea) *
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                placeholder={"+54 9 11 1234 5678\n+54 9 11 8765 4321\n..."}
                className={`${inputClass} font-mono resize-y`}
                autoFocus
              />
              <p className="text-[10px] text-[var(--muted)] mt-1">
                {bulkText.split("\n").filter((s) => s.trim()).length} teléfonos detectados
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Origen (opcional)</label>
                <input
                  type="text"
                  value={bulkOrigen}
                  onChange={(e) => setBulkOrigen(e.target.value)}
                  placeholder="IG / referido / cold..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Etiquetas (separadas por coma)</label>
                <input
                  type="text"
                  value={bulkEtiquetas}
                  onChange={(e) => setBulkEtiquetas(e.target.value)}
                  placeholder="urgente, alto-ticket..."
                  className={inputClass}
                />
              </div>
            </div>

            {isAdmin && (
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Asignar a</label>
                <select
                  value={bulkAsignado}
                  onChange={(e) => setBulkAsignado(e.target.value)}
                  className={inputClass}
                >
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkAdd(false)}
                className="flex-1 bg-transparent border border-[var(--card-border)] text-[var(--muted)] py-2 rounded-lg text-sm hover:border-[var(--muted)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={bulkLoading || bulkText.trim().length === 0}
                className="flex-1 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium"
              >
                {bulkLoading ? "Cargando..." : `Cargar ${bulkText.split("\n").filter((s) => s.trim()).length} prospectos`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ProspectoCard({
  prospecto: p,
  team,
  isAdmin,
  onUpdate,
  onDelete,
}: {
  prospecto: ProspectoRow;
  team: TeamMemberRow[];
  isAdmin: boolean;
  onUpdate: (patch: Partial<ProspectoRow>) => Promise<void> | void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notas, setNotas] = useState(p.notas || "");
  const [etiquetas, setEtiquetas] = useState(p.etiquetas.join(", "));
  const [nombre, setNombre] = useState(p.nombre || "");
  const [instagram, setInstagram] = useState(p.instagram || "");
  const [proximoSeg, setProximoSeg] = useState(p.fecha_proximo_seguimiento || "");

  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 transition-all ${expanded ? "ring-1 ring-[var(--purple)]/40" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md border ${ESTADO_COLORS[p.estado]}`}>
          {ESTADO_LABELS[p.estado]}
        </span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-medium text-white">
            {p.nombre || <span className="text-[var(--muted)] italic">Sin nombre</span>}
            <span className="ml-2 text-xs text-[var(--muted)] font-mono">{p.telefono}</span>
          </p>
          {(p.instagram || p.origen || p.asignado_nombre) && (
            <p className="text-[10px] text-[var(--muted)] mt-0.5">
              {p.instagram && <>@{p.instagram.replace(/^@/, "")} · </>}
              {p.origen && <>{p.origen} · </>}
              {p.asignado_nombre && <>asignado: {p.asignado_nombre}</>}
            </p>
          )}
        </div>

        {/* Quick estado change */}
        <select
          value={p.estado}
          onChange={(e) => onUpdate({ estado: e.target.value as ProspectoRow["estado"] })}
          className="bg-[var(--background)] border border-[var(--card-border)] rounded-md px-2 py-1 text-xs text-white"
        >
          {(Object.keys(ESTADO_LABELS) as ProspectoRow["estado"][]).map((e) => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </select>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--muted)] hover:text-white px-2"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {/* Etiquetas siempre visibles si hay */}
      {p.etiquetas.length > 0 && !expanded && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {p.etiquetas.map((e) => (
            <span key={e} className="text-[10px] bg-[var(--purple)]/10 border border-[var(--purple)]/30 text-[var(--purple-light)] rounded px-1.5 py-0.5">
              {e}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--card-border)]/40 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--muted)] uppercase">Nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={() => { if (nombre !== (p.nombre || "")) onUpdate({ nombre: nombre || null }); }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted)] uppercase">Instagram</label>
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                onBlur={() => { if (instagram !== (p.instagram || "")) onUpdate({ instagram: instagram || null }); }}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[var(--muted)] uppercase">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => { if (notas !== (p.notas || "")) onUpdate({ notas: notas || null }); }}
              rows={2}
              className={`${inputClass} resize-y`}
              placeholder="Qué se le dijo, qué respondió, próxima acción..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[var(--muted)] uppercase">Etiquetas (coma)</label>
              <input
                value={etiquetas}
                onChange={(e) => setEtiquetas(e.target.value)}
                onBlur={() => {
                  const arr = etiquetas.split(",").map((s) => s.trim()).filter(Boolean);
                  const cur = p.etiquetas.join(",");
                  if (arr.join(",") !== cur) onUpdate({ etiquetas: arr });
                }}
                className={inputClass}
                placeholder="urgente, alto-ticket"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--muted)] uppercase">Próximo seguimiento</label>
              <input
                type="date"
                value={proximoSeg}
                onChange={(e) => setProximoSeg(e.target.value)}
                onBlur={() => { if (proximoSeg !== (p.fecha_proximo_seguimiento || "")) onUpdate({ fecha_proximo_seguimiento: proximoSeg || null }); }}
                className={inputClass}
              />
            </div>
          </div>
          {isAdmin && (
            <div>
              <label className="text-[10px] text-[var(--muted)] uppercase">Asignado a</label>
              <select
                value={p.asignado_a || ""}
                onChange={(e) => onUpdate({ asignado_a: e.target.value || null })}
                className={inputClass}
              >
                <option value="">— sin asignar —</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-[var(--red)] border border-[var(--red)]/30 rounded-md px-2 py-1 hover:bg-[var(--red)]/10"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
