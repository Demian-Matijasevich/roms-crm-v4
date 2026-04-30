"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface Client {
  id: string;
  nombre: string;
  programa: string | null;
  estado: string;
  estado_contacto: string;
  fecha_onboarding: string | null;
  fecha_offboarding: string | null;
  total_dias_programa: number;
  exito: boolean;
  pesadilla: boolean;
  deudor_usd: number;
  notas_seguimiento: string | null;
}

interface Props { clients: Client[] }

const ESTADOS_CONTACTO = [
  "por_contactar", "contactado", "respondio_renueva", "respondio_debe_cuota",
  "es_socio", "no_renueva", "no_responde", "numero_invalido",
  "retirar_acceso", "verificar",
];

const ESTADOS = ["activo", "pausado", "inactivo", "solo_skool", "no_termino_pagar"];

const PROGRAMA_LABELS: Record<string, string> = {
  roms_7: "ROMS 7", consultoria: "Consultoría", omnipresencia: "Omnipresencia", multicuentas: "Multicuentas",
};

function daysUntilEnd(c: Client): number | null {
  if (!c.fecha_onboarding) return null;
  const onb = new Date(c.fecha_onboarding);
  const end = new Date(onb.getTime() + c.total_dias_programa * 86400000);
  const today = new Date();
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}

export default function MelUpdateClient({ clients: initial }: Props) {
  const sp = useSearchParams();
  const initialFilter = (() => {
    const f = sp.get("filter");
    if (f === "vencidos" || f === "vencen_pronto" || f === "sin_estado_contacto" || f === "sin_evaluar" || f === "todos") return f;
    return "vencen_pronto" as const;
  })();
  const [clients, setClients] = useState<Client[]>(initial);
  const [filter, setFilter] = useState<"todos" | "vencen_pronto" | "vencidos" | "sin_estado_contacto" | "sin_evaluar">(initialFilter);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const f = sp.get("filter");
    if (f === "vencidos" || f === "vencen_pronto" || f === "sin_estado_contacto" || f === "sin_evaluar" || f === "todos") {
      setFilter(f);
    }
  }, [sp]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const days = daysUntilEnd(c);
      if (filter === "vencen_pronto" && (days === null || days > 30 || days < -7)) return false;
      if (filter === "vencidos" && (days === null || days > 0)) return false;
      if (filter === "sin_estado_contacto" && c.estado_contacto !== "por_contactar") return false;
      if (filter === "sin_evaluar" && (c.exito || c.pesadilla || c.estado === "inactivo")) return false;
      if (search && !c.nombre.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [clients, filter, search]);

  async function update(id: string, field: string, value: string | number | boolean | null) {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const json = await res.json();
    if (json.ok) {
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    } else {
      alert("Error: " + (json.error || "desconocido"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--card-bg)] border border-[var(--purple)]/40 rounded-xl p-5">
        <h1 className="text-2xl font-bold text-white mb-2">📋 Form de actualización (Mel)</h1>
        <p className="text-sm text-[var(--muted)]">
          Aquí marcás rápido el estado de cada cliente. Cambios se guardan al instante.
        </p>
        <ul className="text-xs text-[var(--muted)] mt-2 list-disc ml-5 space-y-1">
          <li><b>Estado contacto</b>: cómo viene la conversación de renovación (respondió, no responde, etc).</li>
          <li><b>Estado</b>: si el cliente sigue adentro o no.</li>
          <li><b>✅ Éxito</b>: si tuvo buenos resultados (sirve como caso testimonial).</li>
          <li><b>⚠️ Pesadilla</b>: si fue cliente difícil/conflictivo.</li>
          <li><b>Notas</b>: cualquier cosa relevante para no perderlo.</li>
        </ul>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-[var(--muted)]">Vista:</span>
        {([
          ["vencen_pronto", "Vencen pronto"],
          ["vencidos", "Ya vencieron"],
          ["sin_estado_contacto", "Sin contacto aún"],
          ["sin_evaluar", "Sin evaluar éxito"],
          ["todos", "Todos"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-lg ${filter === k ? "bg-[var(--purple)] text-white" : "bg-[var(--background)] text-[var(--muted)] hover:text-white"}`}>
            {label}
          </button>
        ))}
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 buscar..."
          className="ml-auto bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-xs text-white" />
        <span className="text-xs text-[var(--muted)]">{filtered.length} clientes</span>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--muted)]">Sin resultados</div>
        ) : filtered.map((c) => {
          const days = daysUntilEnd(c);
          const dayColor = days === null ? "text-[var(--muted)]" : days < 0 ? "text-[var(--red)]" : days <= 7 ? "text-[var(--yellow)]" : days <= 30 ? "text-[var(--purple-light)]" : "text-white";
          return (
            <div key={c.id} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-semibold text-white">{c.nombre}</h3>
                  <p className="text-xs text-[var(--muted)]">{PROGRAMA_LABELS[c.programa || ""] || c.programa || "Sin programa"} · onboarding {c.fecha_onboarding?.split("T")[0] || "—"} · <span className={dayColor}>{days === null ? "—" : days < 0 ? `vencido ${Math.abs(days)}d` : `${days}d restantes`}</span></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => update(c.id, "exito", !c.exito)}
                    className={`text-xs px-3 py-1.5 rounded-lg ${c.exito ? "bg-[var(--green)] text-white" : "bg-white/5 text-[var(--muted)] hover:bg-[var(--green)]/20"}`}>
                    ✅ Éxito
                  </button>
                  <button onClick={() => update(c.id, "pesadilla", !c.pesadilla)}
                    className={`text-xs px-3 py-1.5 rounded-lg ${c.pesadilla ? "bg-[var(--red)] text-white" : "bg-white/5 text-[var(--muted)] hover:bg-[var(--red)]/20"}`}>
                    ⚠️ Pesadilla
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-[var(--muted)] block mb-1">Estado contacto</label>
                  <select defaultValue={c.estado_contacto} onChange={(e) => update(c.id, "estado_contacto", e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-white">
                    {ESTADOS_CONTACTO.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-[var(--muted)] block mb-1">Estado cliente</label>
                  <select defaultValue={c.estado} onChange={(e) => update(c.id, "estado", e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-white">
                    {ESTADOS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-[var(--muted)] block mb-1">Deudor USD</label>
                  <input type="number" defaultValue={c.deudor_usd}
                    onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== c.deudor_usd) update(c.id, "deudor_usd", v); }}
                    className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-white" />
                </div>
              </div>

              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Notas (qué pasó / próximo paso)</label>
                <textarea defaultValue={c.notas_seguimiento || ""}
                  onBlur={(e) => { if (e.target.value !== (c.notas_seguimiento || "")) update(c.id, "notas_seguimiento", e.target.value || null); }}
                  rows={2} placeholder="ej: respondió por wsp, va a renovar la semana que viene"
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-2 text-xs text-white" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
