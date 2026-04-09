"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Semaforo from "@/app/components/Semaforo";
import StatusBadge from "@/app/components/StatusBadge";
import KPICard from "@/app/components/KPICard";
import EmptyState from "@/app/components/EmptyState";
import type { ClientWithRelations } from "@/lib/queries/clients";
import type { AuthSession, SemanaEstado, FollowUpTipo, ClientNote } from "@/lib/types";
import { healthToSemaforo } from "@/lib/types";
import { PROGRAMS, CLIENT_ESTADOS_LABELS } from "@/lib/constants";
import { formatUSD, formatDate, daysUntil } from "@/lib/format";
import { parseLocalDate } from "@/lib/date-utils";

type Tab = "overview" | "pagos" | "sesiones" | "seguimiento" | "followups" | "renovaciones" | "notas" | "timeline";

interface Props {
  client: ClientWithRelations;
  session: AuthSession;
}

const SEMANA_LABELS: Record<string, string> = {
  primeras_publicaciones: "Primeras Publicaciones",
  primera_venta: "Primera Venta",
  escalando_anuncios: "Escalando Anuncios",
};

export default function ClientDetailClient({ client, session }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Follow-up form state
  const [fuTipo, setFuTipo] = useState<FollowUpTipo>("whatsapp");
  const [fuNotas, setFuNotas] = useState("");
  const [fuProxAccion, setFuProxAccion] = useState("");
  const [fuProxFecha, setFuProxFecha] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Resumen" },
    { key: "pagos", label: `Pagos (${client.payments.length})` },
    { key: "sesiones", label: `Sesiones (${client.sessions.length})` },
    { key: "seguimiento", label: "Seguimiento" },
    { key: "followups", label: `Follow-ups (${client.follow_ups.length})` },
    { key: "renovaciones", label: `Renovaciones (${client.renewals.length})` },
    { key: "notas", label: "Notas del equipo" },
    { key: "timeline", label: "Timeline" },
  ];

  const diasRestantes = (() => {
    if (!client.fecha_onboarding) return null;
    const off = parseLocalDate(client.fecha_onboarding);
    off.setDate(off.getDate() + client.total_dias_programa);
    return daysUntil(off.toISOString().split("T")[0]);
  })();

  async function handleSaveSemana(week: 1 | 2 | 3 | 4, estado: SemanaEstado | null, accionables: string | null) {
    setSaving(true);
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [`semana_${week}_estado`]: estado,
        [`semana_${week}_accionables`]: accionables,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  async function handleSaveEstadoSeguimiento(estado: string) {
    setSaving(true);
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_seguimiento: estado }),
    });
    setSaving(false);
    router.refresh();
  }

  async function loadNotes() {
    try {
      const res = await fetch(`/api/client-notes?client_id=${client.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? []);
      }
    } finally {
      setNotesLoaded(true);
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch("/api/client-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: client.id, content: noteContent }),
      });
      if (res.ok) {
        setNoteContent("");
        loadNotes();
      }
    } finally {
      setNoteSaving(false);
    }
  }

  // Load notes when tab is selected
  if (tab === "notas" && !notesLoaded) {
    loadNotes();
  }

  async function handleAddFollowUp() {
    if (!fuNotas.trim()) return;
    setSaving(true);
    const res = await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: client.id,
        tipo: fuTipo,
        notas: fuNotas,
        proxima_accion: fuProxAccion || undefined,
        proxima_fecha: fuProxFecha || undefined,
      }),
    });
    if (res.ok) {
      setShowFollowUpForm(false);
      setFuNotas("");
      setFuProxAccion("");
      setFuProxFecha("");
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.push("/clientes")} className="text-sm text-[var(--muted)] hover:text-white mb-2">
            &larr; Volver a clientes
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {client.nombre}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={client.estado} label={CLIENT_ESTADOS_LABELS[client.estado] ?? client.estado} />
            {client.programa && (
              <span className="text-sm text-[var(--muted)]">{PROGRAMS[client.programa]?.label ?? client.programa}</span>
            )}
            <Semaforo value={healthToSemaforo(client.health_score)} label={`Salud: ${client.health_score}`} />
          </div>
        </div>
        <div className="text-right space-y-2">
          {diasRestantes !== null && (
            <p className={`text-lg font-bold ${diasRestantes <= 0 ? "text-[var(--red)]" : diasRestantes <= 15 ? "text-[var(--yellow)]" : "text-white"}`}>
              {diasRestantes <= 0 ? `Vencido (${Math.abs(diasRestantes)}d)` : `${diasRestantes} dias`}
            </p>
          )}
          <p className="text-xs text-[var(--muted)]">
            {client.fecha_onboarding ? `Onboarding: ${formatDate(client.fecha_onboarding)}` : "Sin onboarding"}
          </p>
          <div className="flex gap-2 justify-end print:hidden">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-xs hover:bg-white/10 transition-colors"
            >
              Generar PDF
            </button>
            <button
              onClick={() => router.push(`/clientes/${client.id}/estado-cuenta`)}
              className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-xs hover:bg-white/10 transition-colors"
            >
              Estado de Cuenta
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--card-border)] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? "border-[var(--purple)] text-[var(--purple-light)]"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase">Datos Personales</h3>
            <div className="space-y-1 text-sm">
              <p><span className="text-[var(--muted)]">Email:</span> <span className="text-white">{client.email || "---"}</span></p>
              <p><span className="text-[var(--muted)]">Telefono:</span> <span className="text-white">{client.telefono || "---"}</span></p>
              <p><span className="text-[var(--muted)]">Discord:</span> <span className="text-white">{client.discord ? "Si" : "No"}</span></p>
              <p><span className="text-[var(--muted)]">Skool:</span> <span className="text-white">{client.skool ? "Si" : "No"}</span></p>
              <p><span className="text-[var(--muted)]">Win Discord:</span> <span className="text-white">{client.win_discord ? "Si" : "No"}</span></p>
            </div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase">Programa</h3>
            <div className="space-y-1 text-sm">
              <p><span className="text-[var(--muted)]">Programa:</span> <span className="text-white">{client.programa ? PROGRAMS[client.programa]?.label ?? client.programa : "---"}</span></p>
              <p><span className="text-[var(--muted)]">Duracion:</span> <span className="text-white">{client.total_dias_programa} dias</span></p>
              <p><span className="text-[var(--muted)]">Sesiones base:</span> <span className="text-white">{client.llamadas_base}</span></p>
              <p><span className="text-[var(--muted)]">Offboarding:</span> <span className="text-white">{formatDate(client.fecha_offboarding)}</span></p>
            </div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase">Sesiones 1a1</h3>
            {client.session_availability ? (
              <div className="space-y-1 text-sm">
                <p><span className="text-[var(--muted)]">Consumidas:</span> <span className="text-white">{client.session_availability.sesiones_consumidas}</span></p>
                <p><span className="text-[var(--muted)]">Disponibles:</span> <span className="text-white">{client.session_availability.sesiones_disponibles}</span></p>
                <Semaforo value={client.session_availability.semaforo} />
                {client.session_availability.rating_promedio !== null && (
                  <p><span className="text-[var(--muted)]">Rating promedio:</span> <span className="text-white">{client.session_availability.rating_promedio}/10</span></p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">Sin datos de sesiones</p>
            )}
          </div>

          {/* Health score KPIs */}
          <KPICard label="Health Score" value={client.health_score} icon="health" />
          <KPICard label="Pagos registrados" value={client.payments.length} icon="payments" />
          <KPICard label="Sesiones 1a1" value={client.sessions.length} icon="sessions" />
        </div>
      )}

      {tab === "pagos" && (
        <div className="space-y-4">
          {client.payments.length === 0 ? (
            <EmptyState message="Sin pagos registrados" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--card-bg)]">
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Cuota</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Monto USD</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Fecha Pago</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Vencimiento</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Estado</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Metodo</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Comprobante</th>
                  </tr>
                </thead>
                <tbody>
                  {client.payments.map((p) => {
                    const vencida = p.estado === "pendiente" && p.fecha_vencimiento && new Date(p.fecha_vencimiento) < new Date();
                    return (
                      <tr key={p.id} className="border-t border-[var(--card-border)]">
                        <td className="px-3 py-2 text-white">
                          #{p.numero_cuota} {p.es_renovacion && <span className="text-xs text-[var(--purple-light)]">(renovacion)</span>}
                        </td>
                        <td className="px-3 py-2 text-white">{formatUSD(p.monto_usd)}</td>
                        <td className="px-3 py-2">{formatDate(p.fecha_pago)}</td>
                        <td className={`px-3 py-2 ${vencida ? "text-[var(--red)]" : ""}`}>
                          {formatDate(p.fecha_vencimiento)}
                          {vencida && <span className="ml-1 text-xs">VENCIDA</span>}
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={p.estado} /></td>
                        <td className="px-3 py-2 text-[var(--muted)]">{p.metodo_pago ?? "---"}</td>
                        <td className="px-3 py-2">
                          {p.comprobante_url ? (
                            <a href={p.comprobante_url} target="_blank" rel="noreferrer" className="text-[var(--purple-light)] hover:underline">Ver</a>
                          ) : (
                            <span className="text-[var(--muted)]">---</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "sesiones" && (
        <div className="space-y-4">
          {client.session_availability && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard label="Base" value={client.session_availability.llamadas_base} icon="base" />
              <KPICard label="Consumidas" value={client.session_availability.sesiones_consumidas} icon="done" />
              <KPICard label="Disponibles" value={client.session_availability.sesiones_disponibles} icon="available" />
              <KPICard label="Rating Prom." value={client.session_availability.rating_promedio ?? 0} icon="rating" />
            </div>
          )}
          {client.sessions.length === 0 ? (
            <EmptyState message="Sin sesiones 1a1 registradas" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--card-bg)]">
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">#</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Estado</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Rating</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Upsell</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {client.sessions.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--card-border)]">
                      <td className="px-3 py-2 text-white">#{s.numero_sesion}</td>
                      <td className="px-3 py-2">{formatDate(s.fecha)}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{s.tipo_sesion.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2"><StatusBadge status={s.estado} /></td>
                      <td className="px-3 py-2 text-white">{s.rating ?? "---"}</td>
                      <td className="px-3 py-2">{s.pitch_upsell ? <span className="text-[var(--green)]">Si</span> : "No"}</td>
                      <td className="px-3 py-2">{formatDate(s.follow_up_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "seguimiento" && (
        <div className="space-y-6">
          {/* Estado seguimiento */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase">Estado de Seguimiento</h3>
            <div className="flex gap-2">
              {(["para_seguimiento", "no_necesita", "seguimiento_urgente"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => handleSaveEstadoSeguimiento(e)}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    client.estado_seguimiento === e
                      ? "bg-[var(--purple)] text-white"
                      : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--purple)]"
                  }`}
                >
                  {e === "para_seguimiento" ? "Para seguimiento" : e === "no_necesita" ? "No necesita" : "Urgente"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-[var(--muted)]">Ultimo seguimiento:</span> <span className="text-white">{formatDate(client.fecha_ultimo_seguimiento)}</span></p>
              <p><span className="text-[var(--muted)]">Proximo seguimiento:</span> <span className="text-white">{formatDate(client.fecha_proximo_seguimiento)}</span></p>
            </div>
          </div>

          {/* Semanas 1-4 */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase">Avance Semanal</h3>
            {([1, 2, 3, 4] as const).map((week) => {
              const estadoKey = `semana_${week}_estado` as keyof typeof client;
              const accKey = `semana_${week}_accionables` as keyof typeof client;
              const currentEstado = client[estadoKey] as SemanaEstado | null;
              const currentAcc = (client[accKey] as string) || "";

              return (
                <div key={week} className="border-b border-[var(--card-border)] pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">Semana {week}</span>
                    <div className="flex gap-1">
                      {(["primeras_publicaciones", "primera_venta", "escalando_anuncios"] as const).map((e) => (
                        <button
                          key={e}
                          onClick={() => handleSaveSemana(week, e, currentAcc)}
                          disabled={saving}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${
                            currentEstado === e
                              ? "bg-[var(--purple)] text-white"
                              : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--purple)]"
                          }`}
                        >
                          {SEMANA_LABELS[e]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    defaultValue={currentAcc}
                    onBlur={(e) => handleSaveSemana(week, currentEstado, e.target.value)}
                    placeholder="Accionables de la semana..."
                    className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none resize-none"
                    rows={2}
                  />
                </div>
              );
            })}
          </div>

          {/* Facturacion */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase">Facturacion Mensual</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {([1, 2, 3, 4] as const).map((mes) => (
                <div key={mes}>
                  <label className="text-[var(--muted)] text-xs">Mes {mes}</label>
                  <p className="text-white">{(client as unknown as Record<string, unknown>)[`facturacion_mes_${mes}`] as string || "---"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "followups" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowFollowUpForm(!showFollowUpForm)}
              className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm hover:bg-[var(--purple-dark)] transition-colors"
            >
              + Agregar Follow-up
            </button>
          </div>

          {showFollowUpForm && (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--muted)]">Tipo</label>
                  <select
                    value={fuTipo}
                    onChange={(e) => setFuTipo(e.target.value as FollowUpTipo)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="llamada">Llamada</option>
                    <option value="dm">DM Instagram</option>
                    <option value="email">Email</option>
                    <option value="presencial">Presencial</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)]">Proxima Fecha</label>
                  <input
                    type="date"
                    value={fuProxFecha}
                    onChange={(e) => setFuProxFecha(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]">Notas</label>
                <textarea
                  value={fuNotas}
                  onChange={(e) => setFuNotas(e.target.value)}
                  placeholder="Que paso en este seguimiento..."
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none resize-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)]">Proxima Accion</label>
                <input
                  type="text"
                  value={fuProxAccion}
                  onChange={(e) => setFuProxAccion(e.target.value)}
                  placeholder="Que hay que hacer despues..."
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowFollowUpForm(false)}
                  className="px-4 py-2 text-sm text-[var(--muted)] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddFollowUp}
                  disabled={saving || !fuNotas.trim()}
                  className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm disabled:opacity-50 hover:bg-[var(--purple-dark)]"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          )}

          {client.follow_ups.length === 0 ? (
            <EmptyState message="Sin follow-ups registrados" />
          ) : (
            <div className="space-y-3">
              {client.follow_ups.map((fu) => (
                <div key={fu.id} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={fu.tipo} />
                      <span className="text-xs text-[var(--muted)]">{formatDate(fu.fecha)}</span>
                    </div>
                    <span className="text-xs text-[var(--muted)]">
                      por {(fu as unknown as Record<string, unknown> & { author?: { nombre: string } }).author?.nombre ?? "---"}
                    </span>
                  </div>
                  <p className="text-sm text-white">{fu.notas}</p>
                  {fu.proxima_accion && (
                    <p className="text-xs text-[var(--muted)] mt-2">
                      Proxima accion: <span className="text-[var(--purple-light)]">{fu.proxima_accion}</span>
                      {fu.proxima_fecha && ` \u2014 ${formatDate(fu.proxima_fecha)}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "renovaciones" && (
        <div className="space-y-4">
          {client.renewals.length === 0 ? (
            <EmptyState message="Sin historial de renovaciones" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--card-bg)]">
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Programa Anterior</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Programa Nuevo</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Monto</th>
                    <th className="px-3 py-2 text-left text-xs text-[var(--muted)] font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {client.renewals.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--card-border)]">
                      <td className="px-3 py-2">{formatDate(r.fecha_renovacion)}</td>
                      <td className="px-3 py-2 text-white">{r.tipo_renovacion?.replace(/_/g, " ") ?? "---"}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{r.programa_anterior ? PROGRAMS[r.programa_anterior]?.label ?? r.programa_anterior : "---"}</td>
                      <td className="px-3 py-2 text-white">{r.programa_nuevo ? PROGRAMS[r.programa_nuevo]?.label ?? r.programa_nuevo : "---"}</td>
                      <td className="px-3 py-2 text-white">{formatUSD(r.monto_total)}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.estado ?? "---"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "notas" && (
        <div className="space-y-4">
          {/* Add note form */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Escribir una nota para el equipo..."
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none resize-none"
              rows={3}
            />
            <div className="flex justify-end">
              <button
                onClick={handleAddNote}
                disabled={noteSaving || !noteContent.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
              >
                {noteSaving ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>

          {/* Notes list */}
          {!notesLoaded ? (
            <p className="text-[var(--muted)] text-sm text-center py-4">Cargando notas...</p>
          ) : notes.length === 0 ? (
            <EmptyState message="Sin notas del equipo" />
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className={`bg-[var(--card-bg)] border rounded-xl p-4 ${
                    note.pinned ? "border-[var(--purple)]" : "border-[var(--card-border)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {note.pinned && <span className="text-xs text-[var(--purple-light)]">Fijada</span>}
                      <span className="text-sm font-medium text-white">{note.author?.nombre ?? "---"}</span>
                    </div>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(note.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-white whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "timeline" && (() => {
        // Build timeline events
        interface TimelineEvent {
          date: string;
          type: "creacion" | "pago" | "sesion" | "followup" | "nota" | "renovacion" | "estado";
          color: string;
          title: string;
          description: string;
        }

        const events: TimelineEvent[] = [];

        // Client creation
        if (client.created_at) {
          events.push({
            date: client.created_at,
            type: "creacion",
            color: "var(--purple)",
            title: "Cliente creado",
            description: `${client.nombre} ingreso al programa${client.programa ? ` (${PROGRAMS[client.programa]?.label ?? client.programa})` : ""}`,
          });
        }

        // Onboarding
        if (client.fecha_onboarding) {
          events.push({
            date: client.fecha_onboarding,
            type: "creacion",
            color: "var(--green)",
            title: "Onboarding",
            description: `Fecha de onboarding registrada`,
          });
        }

        // Payments
        client.payments.forEach((p) => {
          const dateStr = p.fecha_pago ?? p.created_at;
          events.push({
            date: dateStr,
            type: "pago",
            color: p.estado === "pagado" ? "var(--green)" : p.estado === "pendiente" ? "var(--yellow)" : "var(--red)",
            title: `Pago #${p.numero_cuota} — ${formatUSD(p.monto_usd)}`,
            description: `Estado: ${p.estado}${p.metodo_pago ? ` | Metodo: ${p.metodo_pago}` : ""}${p.es_renovacion ? " (renovacion)" : ""}`,
          });
        });

        // Sessions
        client.sessions.forEach((s) => {
          const dateStr = s.fecha ?? s.created_at;
          events.push({
            date: dateStr,
            type: "sesion",
            color: "var(--blue, #3b82f6)",
            title: `Sesion #${s.numero_sesion} — ${s.tipo_sesion.replace(/_/g, " ")}`,
            description: `Estado: ${s.estado}${s.rating ? ` | Rating: ${s.rating}/10` : ""}${s.pitch_upsell ? " | Pitch upsell" : ""}`,
          });
        });

        // Follow-ups
        client.follow_ups.forEach((fu) => {
          events.push({
            date: fu.fecha ?? fu.created_at,
            type: "followup",
            color: "var(--cyan, #06b6d4)",
            title: `Follow-up (${fu.tipo})`,
            description: `${fu.notas ?? ""}${fu.proxima_accion ? ` | Proxima: ${fu.proxima_accion}` : ""}`,
          });
        });

        // Renewals
        client.renewals.forEach((r) => {
          const dateStr = r.fecha_renovacion ?? r.created_at;
          events.push({
            date: dateStr,
            type: "renovacion",
            color: "var(--purple-light, #a78bfa)",
            title: `Renovacion — ${r.tipo_renovacion?.replace(/_/g, " ") ?? "---"}`,
            description: `${formatUSD(r.monto_total)}${r.programa_nuevo ? ` → ${PROGRAMS[r.programa_nuevo]?.label ?? r.programa_nuevo}` : ""} | Estado: ${r.estado ?? "---"}`,
          });
        });

        // Notes
        notes.forEach((n) => {
          events.push({
            date: n.created_at,
            type: "nota",
            color: "var(--muted)",
            title: `Nota del equipo`,
            description: n.content.length > 120 ? n.content.slice(0, 120) + "..." : n.content,
          });
        });

        // Sort by date descending (newest first)
        events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return (
          <div className="space-y-1">
            {events.length === 0 ? (
              <EmptyState message="Sin eventos en el timeline" />
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-3 bottom-3 w-[2px] bg-[var(--card-border)]" />

                <div className="space-y-4">
                  {events.map((ev, i) => (
                    <div key={`${ev.type}-${i}`} className="relative flex gap-4 pl-6">
                      {/* Dot */}
                      <div
                        className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 shrink-0"
                        style={{ borderColor: ev.color, backgroundColor: "var(--card-bg)" }}
                      />

                      {/* Content */}
                      <div className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: ev.color }}>
                            {ev.type === "creacion" ? "Creacion" : ev.type === "pago" ? "Pago" : ev.type === "sesion" ? "Sesion 1a1" : ev.type === "followup" ? "Follow-up" : ev.type === "renovacion" ? "Renovacion" : ev.type === "nota" ? "Nota" : "Estado"}
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            {new Date(ev.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-sm text-white font-medium">{ev.title}</p>
                        <p className="text-xs text-[var(--muted)] mt-0.5">{ev.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
