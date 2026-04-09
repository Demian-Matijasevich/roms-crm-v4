"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Semaforo from "@/app/components/Semaforo";
import StatusBadge from "@/app/components/StatusBadge";
import EmptyState from "@/app/components/EmptyState";
import type { Client, SessionAvailability, AuthSession, FollowUpTipo } from "@/lib/types";
import { healthToSemaforo } from "@/lib/types";
import { PROGRAMS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { parseLocalDate } from "@/lib/date-utils";

type ViewMode = "queue" | "semanas";

interface Props {
  clients: Client[];
  availability: SessionAvailability[];
  session: AuthSession;
}

const SEMANA_LABELS: Record<string, string> = {
  primeras_publicaciones: "Publicaciones",
  primera_venta: "1ra Venta",
  escalando_anuncios: "Escalando",
};

function getPriority(client: Client): { level: number; label: string; color: string } {
  // Days since last follow-up
  const daysSince = client.fecha_ultimo_seguimiento
    ? Math.floor((Date.now() - parseLocalDate(client.fecha_ultimo_seguimiento).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (client.estado_seguimiento === "seguimiento_urgente" || (daysSince >= 7 && client.estado_seguimiento === "para_seguimiento")) {
    return { level: 0, label: "Urgente", color: "rojo" };
  }
  if (client.estado_seguimiento === "para_seguimiento") {
    return { level: 1, label: "Pendiente", color: "amarillo" };
  }
  return { level: 2, label: "Al dia", color: "verde" };
}

export default function SeguimientoClient({ clients, availability, session: authSession }: Props) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("queue");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline follow-up form state
  const [inlineFuClientId, setInlineFuClientId] = useState<string | null>(null);
  const [inlineFuTipo, setInlineFuTipo] = useState<FollowUpTipo>("whatsapp");
  const [inlineFuNotas, setInlineFuNotas] = useState("");
  const [inlineFuProxAccion, setInlineFuProxAccion] = useState("");
  const [inlineFuProxFecha, setInlineFuProxFecha] = useState("");

  // Availability map
  const availMap = useMemo(() => {
    const map: Record<string, SessionAvailability> = {};
    availability.forEach((a) => { map[a.client_id] = a; });
    return map;
  }, [availability]);

  // Sorted by priority
  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa.level !== pb.level) return pa.level - pb.level;
      // Within same priority, sort by health score ascending (worse first)
      return a.health_score - b.health_score;
    });
  }, [clients]);

  async function handleAddInlineFollowUp() {
    if (!inlineFuClientId || !inlineFuNotas.trim()) return;
    setSaving(true);
    const res = await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: inlineFuClientId,
        tipo: inlineFuTipo,
        notas: inlineFuNotas,
        proxima_accion: inlineFuProxAccion || undefined,
        proxima_fecha: inlineFuProxFecha || undefined,
      }),
    });
    if (res.ok) {
      setInlineFuClientId(null);
      setInlineFuNotas("");
      setInlineFuProxAccion("");
      setInlineFuProxFecha("");
      router.refresh();
    }
    setSaving(false);
  }

  async function handleRefreshScores() {
    setSaving(true);
    await fetch("/api/health-score/refresh", { method: "POST" });
    setSaving(false);
    router.refresh();
  }

  const inputCls = "w-full px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none";

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-[var(--card-bg)] rounded-lg p-1 border border-[var(--card-border)]">
          <button
            onClick={() => setViewMode("queue")}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              viewMode === "queue" ? "bg-[var(--purple)] text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Cola Prioridad
          </button>
          <button
            onClick={() => setViewMode("semanas")}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              viewMode === "semanas" ? "bg-[var(--purple)] text-white" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Vista Semanas
          </button>
        </div>
        {authSession.is_admin && (
          <button
            onClick={handleRefreshScores}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] text-sm hover:text-white hover:border-[var(--purple)] disabled:opacity-50"
          >
            {saving ? "Actualizando..." : "Refresh Scores"}
          </button>
        )}
      </div>

      {/* Priority Queue View */}
      {viewMode === "queue" && (
        <div className="space-y-3">
          {sortedClients.length === 0 ? (
            <EmptyState message="Sin alumnos activos" />
          ) : (
            sortedClients.map((client) => {
              const priority = getPriority(client);
              const avail = availMap[client.id];
              const isExpanded = expandedId === client.id;

              return (
                <div key={client.id} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                  <div
                    className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5"
                    onClick={() => setExpandedId(isExpanded ? null : client.id)}
                  >
                    {/* Priority indicator */}
                    <Semaforo value={priority.color} label={priority.label} />

                    {/* Client info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{client.nombre}</span>
                        <span className="text-xs text-[var(--muted)]">{client.programa ? PROGRAMS[client.programa]?.label : ""}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted)]">
                        <span>Ultimo: {formatDate(client.fecha_ultimo_seguimiento)}</span>
                        <span>Proximo: {formatDate(client.fecha_proximo_seguimiento)}</span>
                        {client.semana_1_estado && (
                          <span>S1: {SEMANA_LABELS[client.semana_1_estado] ?? client.semana_1_estado}</span>
                        )}
                      </div>
                    </div>

                    {/* Health + sessions */}
                    <Semaforo value={healthToSemaforo(client.health_score)} label={`${client.health_score}`} />
                    {avail && <Semaforo value={avail.semaforo} label={`${avail.sesiones_consumidas}/${avail.llamadas_base}`} />}

                    <span className="text-[var(--muted)]">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                  </div>

                  {/* Expanded: timeline + inline follow-up */}
                  {isExpanded && (
                    <div className="border-t border-[var(--card-border)] p-4 space-y-4">
                      {/* Quick info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-[var(--muted)] text-xs">Estado</span>
                          <p><StatusBadge status={client.estado} /></p>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] text-xs">Seguimiento</span>
                          <p><StatusBadge status={client.estado_seguimiento} /></p>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] text-xs">Contacto</span>
                          <p><StatusBadge status={client.estado_contacto} /></p>
                        </div>
                        <div>
                          <span className="text-[var(--muted)] text-xs">Onboarding</span>
                          <p className="text-white text-sm">{formatDate(client.fecha_onboarding)}</p>
                        </div>
                      </div>

                      {/* Semanas */}
                      <div className="grid grid-cols-4 gap-2">
                        {([1, 2, 3, 4] as const).map((w) => {
                          const est = client[`semana_${w}_estado` as keyof Client] as string | null;
                          return (
                            <div key={w} className="bg-black/20 rounded-lg p-2 text-center">
                              <span className="text-xs text-[var(--muted)]">Semana {w}</span>
                              <p className="text-sm text-white mt-1">{est ? SEMANA_LABELS[est] ?? est : "---"}</p>
                            </div>
                          );
                        })}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/clientes/${client.id}`)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--muted)] hover:text-white hover:border-[var(--purple)]"
                        >
                          Ver perfil completo
                        </button>
                        <button
                          onClick={() => setInlineFuClientId(inlineFuClientId === client.id ? null : client.id)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--purple)] text-white text-sm hover:bg-[var(--purple-dark)]"
                        >
                          + Follow-up
                        </button>
                      </div>

                      {/* Inline follow-up form */}
                      {inlineFuClientId === client.id && (
                        <div className="bg-black/20 rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-[var(--muted)]">Tipo</label>
                              <select value={inlineFuTipo} onChange={(e) => setInlineFuTipo(e.target.value as FollowUpTipo)} className={inputCls}>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="llamada">Llamada</option>
                                <option value="dm">DM</option>
                                <option value="email">Email</option>
                                <option value="presencial">Presencial</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-[var(--muted)]">Proxima Fecha</label>
                              <input type="date" value={inlineFuProxFecha} onChange={(e) => setInlineFuProxFecha(e.target.value)} className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-[var(--muted)]">Notas *</label>
                            <textarea value={inlineFuNotas} onChange={(e) => setInlineFuNotas(e.target.value)} className={inputCls + " resize-none"} rows={2} placeholder="Que paso..." />
                          </div>
                          <div>
                            <label className="text-xs text-[var(--muted)]">Proxima Accion</label>
                            <input type="text" value={inlineFuProxAccion} onChange={(e) => setInlineFuProxAccion(e.target.value)} className={inputCls} placeholder="Que hacer despues..." />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setInlineFuClientId(null)} className="text-sm text-[var(--muted)]">Cancelar</button>
                            <button
                              onClick={handleAddInlineFollowUp}
                              disabled={saving || !inlineFuNotas.trim()}
                              className="px-4 py-1.5 rounded-lg bg-[var(--purple)] text-white text-sm disabled:opacity-50"
                            >
                              {saving ? "..." : "Guardar"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Semanas Grid View */}
      {viewMode === "semanas" && (
        <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--card-bg)]">
                <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium sticky left-0 bg-[var(--card-bg)] z-10">Alumno</th>
                <th className="px-3 py-2 text-center text-xs text-[var(--muted)] font-medium">Salud</th>
                <th className="px-3 py-2 text-center text-xs text-[var(--muted)] font-medium">Semana 1</th>
                <th className="px-3 py-2 text-center text-xs text-[var(--muted)] font-medium">Semana 2</th>
                <th className="px-3 py-2 text-center text-xs text-[var(--muted)] font-medium">Semana 3</th>
                <th className="px-3 py-2 text-center text-xs text-[var(--muted)] font-medium">Semana 4</th>
                <th className="px-3 py-2 text-center text-xs text-[var(--muted)] font-medium">Seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {sortedClients.map((client) => (
                <tr
                  key={client.id}
                  className="border-t border-[var(--card-border)] cursor-pointer hover:bg-white/5"
                  onClick={() => router.push(`/clientes/${client.id}`)}
                >
                  <td className="px-3 py-2 sticky left-0 bg-[var(--card-bg)] z-10">
                    <span className="font-medium text-white">{client.nombre}</span>
                    <span className="text-xs text-[var(--muted)] ml-2">{client.programa ? PROGRAMS[client.programa]?.label : ""}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Semaforo value={healthToSemaforo(client.health_score)} label={`${client.health_score}`} />
                  </td>
                  {([1, 2, 3, 4] as const).map((w) => {
                    const est = client[`semana_${w}_estado` as keyof Client] as string | null;
                    return (
                      <td key={w} className="px-3 py-2 text-center">
                        {est ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                            est === "escalando_anuncios" ? "bg-[var(--green)]/15 text-[var(--green)]" :
                            est === "primera_venta" ? "bg-[var(--yellow)]/15 text-[var(--yellow)]" :
                            "bg-[var(--purple)]/15 text-[var(--purple-light)]"
                          }`}>
                            {SEMANA_LABELS[est] ?? est}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">---</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={client.estado_seguimiento} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
