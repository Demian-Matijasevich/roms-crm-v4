"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Client } from "@/lib/types";
import { PROGRAMS, CLIENT_ESTADOS_LABELS } from "@/lib/constants";

interface Props {
  clients: Client[];
  notesCounts?: Record<string, number>;
}

const ESTADOS = ["activo", "pausado", "inactivo", "solo_skool", "no_termino_pagar"];
const ESTADOS_CONTACTO = [
  "por_contactar", "contactado", "respondio_renueva", "respondio_debe_cuota",
  "es_socio", "no_renueva", "no_responde", "numero_invalido",
  "retirar_acceso", "verificar",
];
const PROGRAMAS = ["roms_7", "consultoria", "omnipresencia", "multicuentas"];
const SEGUIMIENTO = ["para_seguimiento", "no_necesita", "seguimiento_urgente"];

export default function ClientesClient({ clients, notesCounts = {} }: Props) {
  const [localClients, setLocalClients] = useState<Client[]>(clients);

  const [fEstado, setFEstado] = useState<string>("todos");
  const [fPrograma, setFPrograma] = useState<string>("todos");
  const [fContacto, setFContacto] = useState<string>("todos");
  const [fSalud, setFSalud] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = localClients;
    if (fEstado !== "todos") result = result.filter((c) => c.estado === fEstado);
    if (fPrograma !== "todos") result = result.filter((c) => c.programa === fPrograma);
    if (fContacto !== "todos") result = result.filter((c) => c.estado_contacto === fContacto);
    if (fSalud !== "todos") {
      result = result.filter((c) => {
        if (fSalud === "verde") return c.health_score >= 80;
        if (fSalud === "amarillo") return c.health_score >= 50 && c.health_score < 80;
        if (fSalud === "rojo") return c.health_score < 50;
        return true;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        (c.nombre || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.telefono || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [localClients, fEstado, fPrograma, fContacto, fSalud, search]);

  async function updateField(clientId: string, field: string, value: string | number | boolean | null) {
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocalClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, [field]: value } : c)));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Estado</label>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            {ESTADOS.map((e) => (<option key={e} value={e}>{CLIENT_ESTADOS_LABELS[e] ?? e}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Programa</label>
          <select value={fPrograma} onChange={(e) => setFPrograma(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            {PROGRAMAS.map((p) => (<option key={p} value={p}>{PROGRAMS[p]?.label ?? p}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Contacto</label>
          <select value={fContacto} onChange={(e) => setFContacto(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos</option>
            {ESTADOS_CONTACTO.map((e) => (<option key={e} value={e}>{e}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Salud</label>
          <select value={fSalud} onChange={(e) => setFSalud(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white">
            <option value="todos">Toda</option>
            <option value="verde">Verde (80-100)</option>
            <option value="amarillo">Amarillo (50-79)</option>
            <option value="rojo">Rojo (0-49)</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-[var(--muted)] block mb-1">Buscar (nombre / email / tel)</label>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 text-xs text-white" />
        </div>
        <span className="text-xs text-[var(--muted)] pb-2">
          <span className="text-white font-bold">{filtered.length}</span> / {localClients.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1300px]">
            <thead>
              <tr className="bg-[var(--background)] text-left text-[var(--muted)] text-[10px] uppercase">
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Tel</th>
                <th className="py-2 px-2 w-[110px]">Programa</th>
                <th className="py-2 px-2 w-[100px]">Estado</th>
                <th className="py-2 px-2 w-[130px]">Contacto</th>
                <th className="py-2 px-2 w-[130px]">Seguimiento</th>
                <th className="py-2 px-2 w-[100px]">Onboarding</th>
                <th className="py-2 px-2 w-[70px] text-right">Salud</th>
                <th className="py-2 px-2 w-[90px] text-right">Deudor USD</th>
                <th className="py-2 px-2 w-[60px] text-center">Notas</th>
                <th className="py-2 px-2 w-[60px] text-center">Ver</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="py-12 text-center text-[var(--muted)]">Sin resultados</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                  <td className="py-1 px-2">
                    <input type="text" defaultValue={c.nombre}
                      onBlur={(e) => { if (e.target.value !== c.nombre && e.target.value) updateField(c.id, "nombre", e.target.value); }}
                      className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-white font-medium focus:outline-none" />
                  </td>
                  <td className="py-1 px-2">
                    <input type="email" defaultValue={c.email || ""}
                      onBlur={(e) => { if (e.target.value !== (c.email || "")) updateField(c.id, "email", e.target.value || null); }}
                      className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2">
                    <input type="text" defaultValue={c.telefono || ""}
                      onBlur={(e) => { if (e.target.value !== (c.telefono || "")) updateField(c.id, "telefono", e.target.value || null); }}
                      className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                  </td>
                  <td className="py-1 px-2">
                    <select defaultValue={c.programa || ""}
                      onChange={(e) => updateField(c.id, "programa", e.target.value || null)}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                      <option value="">—</option>
                      {PROGRAMAS.map((p) => (<option key={p} value={p}>{PROGRAMS[p]?.label ?? p}</option>))}
                    </select>
                  </td>
                  <td className="py-1 px-2">
                    <select defaultValue={c.estado}
                      onChange={(e) => updateField(c.id, "estado", e.target.value)}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                      {ESTADOS.map((e) => (<option key={e} value={e}>{CLIENT_ESTADOS_LABELS[e] ?? e}</option>))}
                    </select>
                  </td>
                  <td className="py-1 px-2">
                    <select defaultValue={c.estado_contacto}
                      onChange={(e) => updateField(c.id, "estado_contacto", e.target.value)}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                      {ESTADOS_CONTACTO.map((e) => (<option key={e} value={e}>{e}</option>))}
                    </select>
                  </td>
                  <td className="py-1 px-2">
                    <select defaultValue={c.estado_seguimiento}
                      onChange={(e) => updateField(c.id, "estado_seguimiento", e.target.value)}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                      {SEGUIMIENTO.map((e) => (<option key={e} value={e}>{e}</option>))}
                    </select>
                  </td>
                  <td className="py-1 px-2">
                    <input type="date" defaultValue={c.fecha_onboarding?.split("T")[0] || ""}
                      onBlur={(e) => { const v = e.target.value || null; if (v !== (c.fecha_onboarding?.split("T")[0] || null)) updateField(c.id, "fecha_onboarding", v); }}
                      className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none w-[95px]" />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input type="number" min={0} max={100} defaultValue={c.health_score}
                      onBlur={(e) => { const v = parseInt(e.target.value); if (Number.isFinite(v) && v !== c.health_score) updateField(c.id, "health_score", v); }}
                      className={`w-14 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right font-bold focus:outline-none ${c.health_score >= 80 ? "text-[var(--green)]" : c.health_score >= 50 ? "text-[var(--yellow)]" : "text-[var(--red)]"}`} />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <input type="number" step={100} defaultValue={c.deudor_usd || 0}
                      onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== (c.deudor_usd || 0)) updateField(c.id, "deudor_usd", v); }}
                      className="w-20 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right text-[var(--red)] focus:outline-none" />
                  </td>
                  <td className="py-1 px-2 text-center">
                    {notesCounts[c.id] ? (
                      <span className="text-xs text-[var(--purple-light)]">💬 {notesCounts[c.id]}</span>
                    ) : (
                      <span className="text-[var(--muted)] text-xs">—</span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-center">
                    <Link href={`/clientes/${c.id}`}
                      className="text-xs text-[var(--purple-light)] hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
