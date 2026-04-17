"use client";

import { useState, useEffect, useMemo } from "react";
import type { AuthSession, TeamMember } from "@/lib/types";
import { PROGRAMS, RECEPTORES } from "@/lib/constants";
import { formatUSD } from "@/lib/format";

interface Props {
  closers: TeamMember[];
  usdRate: number;
  session: AuthSession;
}

interface LeadRow {
  id: string;
  nombre: string | null;
  email: string | null;
  instagram: string | null;
  telefono: string | null;
  fecha_llamada: string | null;
  fecha_agendado: string | null;
  estado: string;
  programa_pitcheado: string | null;
  ticket_total: number;
  notas_internas: string | null;
}

type EstadoResultado = "cerrado" | "adentro_seguimiento" | "no_cierre" | "seguimiento" | "cancelada" | "no_show" | "reprogramada" | "";

interface LeadEdit {
  sePresento: "si" | "no" | "";
  estado: EstadoResultado;
  programa: string;
  ticketTotal: string;
  // payment
  currency: "USD" | "ARS";
  monto: string;
  fechaPago: string;
  metodoPago: string;
  receptor: string;
  notas: string;
  comprobanteUrl: string;
  // ui
  expanded: boolean;
  submitted: boolean;
  error: string | null;
}

const METODOS = ["mercado_pago", "transferencia", "cash", "binance", "stripe", "wise"];

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function emptyEdit(): LeadEdit {
  return {
    sePresento: "",
    estado: "",
    programa: "",
    ticketTotal: "",
    currency: "USD",
    monto: "",
    fechaPago: todayISO(),
    metodoPago: "",
    receptor: "",
    notas: "",
    comprobanteUrl: "",
    expanded: false,
    submitted: false,
    error: null,
  };
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";
const labelClass = "text-xs text-[var(--muted)] block mb-1";

export default function CargarDiaForm({ closers, usdRate, session }: Props) {
  const [selectedCloser, setSelectedCloser] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [edits, setEdits] = useState<Record<string, LeadEdit>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  void session;

  const closer = useMemo(() => closers.find((c) => c.id === selectedCloser) || null, [closers, selectedCloser]);

  // Fetch leads for closer + date when both are set
  useEffect(() => {
    if (!selectedCloser || !selectedDate) return;
    setLoading(true);
    setLeads([]);
    setEdits({});
    fetch(`/api/cargar-dia?closer_id=${selectedCloser}&fecha=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        const list = (data.leads || []) as LeadRow[];
        setLeads(list);
        const map: Record<string, LeadEdit> = {};
        for (const l of list) {
          map[l.id] = emptyEdit();
          // Pre-fill from current state
          if (l.estado === "cerrado" || l.estado === "adentro_seguimiento") {
            map[l.id].estado = l.estado as EstadoResultado;
            map[l.id].sePresento = "si";
            map[l.id].programa = l.programa_pitcheado || "";
            map[l.id].ticketTotal = String(l.ticket_total || "");
          } else if (l.estado === "no_show") {
            map[l.id].sePresento = "no";
          } else if (l.estado !== "pendiente") {
            map[l.id].estado = l.estado as EstadoResultado;
            map[l.id].sePresento = "si";
          }
        }
        setEdits(map);
      })
      .finally(() => setLoading(false));
  }, [selectedCloser, selectedDate]);

  function updateEdit(leadId: string, patch: Partial<LeadEdit>) {
    setEdits((prev) => ({ ...prev, [leadId]: { ...prev[leadId], ...patch } }));
  }

  async function saveLead(leadId: string) {
    const e = edits[leadId];
    if (!e) return;
    setSavingId(leadId);
    updateEdit(leadId, { error: null });

    const monto = parseFloat(e.monto) || 0;
    const montoUsd = e.currency === "USD" ? monto : (monto > 0 ? Math.round(monto / usdRate) : 0);
    const montoArs = e.currency === "ARS" ? monto : 0;

    const effEstado: EstadoResultado = e.sePresento === "no" ? "no_show" : e.estado;

    try {
      const res = await fetch("/api/cargar-dia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          estado: effEstado,
          programa: e.programa || null,
          ticket_total: e.ticketTotal ? parseFloat(e.ticketTotal) : null,
          notas: e.notas || null,
          payment: (effEstado === "cerrado" || effEstado === "adentro_seguimiento") && monto > 0
            ? {
                monto_usd: montoUsd,
                monto_ars: montoArs,
                fecha_pago: e.fechaPago || null,
                metodo_pago: e.metodoPago || null,
                receptor: e.receptor || null,
                comprobante_url: e.comprobanteUrl || null,
              }
            : null,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        updateEdit(leadId, { submitted: true });
        setSavedCount((n) => n + 1);
      } else {
        updateEdit(leadId, { error: json.error || "Error" });
      }
    } catch (err) {
      updateEdit(leadId, { error: err instanceof Error ? err.message : "Error" });
    } finally {
      setSavingId(null);
    }
  }

  async function uploadComprobante(leadId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("lead_id", leadId);
    const res = await fetch("/api/pagos?upload=1", { method: "POST", body: fd });
    const json = await res.json();
    if (json.ok && json.url) {
      updateEdit(leadId, { comprobanteUrl: json.url });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Carga diaria de ventas</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Elegí un closer y una fecha para ver las llamadas del día y cargarlas una por una.
        </p>
      </div>

      {/* Step 1: Selector */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Closer</label>
            <select className={inputClass} value={selectedCloser} onChange={(e) => setSelectedCloser(e.target.value)}>
              <option value="">Seleccionar closer...</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" className={inputClass} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Leads list */}
      {selectedCloser && selectedDate && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Llamadas de {closer?.nombre} — {selectedDate}
              <span className="ml-2 text-[var(--muted)] font-normal">({leads.length})</span>
            </h2>
            {savedCount > 0 && (
              <span className="text-sm text-[var(--green)]">✓ {savedCount} guardadas</span>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-[var(--muted)]">Cargando...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-[var(--muted)]">
              No hay llamadas para este closer en esta fecha.
            </div>
          ) : (
            <div className="divide-y divide-[var(--card-border)]">
              {leads.map((l) => {
                const e = edits[l.id];
                if (!e) return null;
                const showPaymentFields = e.estado === "cerrado" || e.estado === "adentro_seguimiento";
                return (
                  <div key={l.id} className={`px-6 py-4 ${e.submitted ? "bg-[var(--green)]/5" : ""}`}>
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => updateEdit(l.id, { expanded: !e.expanded })}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">
                          {l.nombre || "Sin nombre"}
                          {e.submitted && <span className="ml-2 text-xs text-[var(--green)]">✓ Guardado</span>}
                        </p>
                        <div className="text-xs text-[var(--muted)] flex gap-3 mt-1 flex-wrap">
                          {l.instagram && <span>@{l.instagram.replace(/^@/, "")}</span>}
                          {l.telefono && <span>{l.telefono}</span>}
                          {l.email && <span>{l.email}</span>}
                        </div>
                      </div>
                      <button className="text-sm text-[var(--muted)]">{e.expanded ? "▲" : "▼"}</button>
                    </div>

                    {/* Expanded form */}
                    {e.expanded && (
                      <div className="mt-4 space-y-3">
                        {/* ¿Se presentó? */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateEdit(l.id, { sePresento: "si" })}
                            className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                              e.sePresento === "si" ? "bg-[var(--green)]/20 border-[var(--green)] text-[var(--green)]" : "border-[var(--card-border)] text-[var(--muted)]"
                            }`}
                          >
                            ✓ Se presentó
                          </button>
                          <button
                            type="button"
                            onClick={() => updateEdit(l.id, { sePresento: "no", estado: "" })}
                            className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                              e.sePresento === "no" ? "bg-red-500/20 border-red-500 text-red-400" : "border-[var(--card-border)] text-[var(--muted)]"
                            }`}
                          >
                            ✗ No show
                          </button>
                        </div>

                        {/* If presentó → estado */}
                        {e.sePresento === "si" && (
                          <div>
                            <label className={labelClass}>Resultado</label>
                            <select className={inputClass} value={e.estado} onChange={(ev) => updateEdit(l.id, { estado: ev.target.value as EstadoResultado })}>
                              <option value="">Seleccionar...</option>
                              <option value="cerrado">Cerrado (venta hecha)</option>
                              <option value="adentro_seguimiento">Adentro en seguimiento</option>
                              <option value="no_cierre">No cierre</option>
                              <option value="seguimiento">Seguimiento (prospecto)</option>
                              <option value="cancelada">Cancelada</option>
                              <option value="reprogramada">Reprogramada</option>
                            </select>
                          </div>
                        )}

                        {/* Payment fields */}
                        {showPaymentFields && (
                          <div className="bg-[var(--background)]/50 rounded-lg p-3 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={labelClass}>Programa</label>
                                <select className={inputClass} value={e.programa} onChange={(ev) => updateEdit(l.id, { programa: ev.target.value })}>
                                  <option value="">...</option>
                                  {Object.entries(PROGRAMS).map(([k, p]) => (
                                    <option key={k} value={k}>{p.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={labelClass}>Ticket total (USD)</label>
                                <input type="number" className={inputClass} value={e.ticketTotal} onChange={(ev) => updateEdit(l.id, { ticketTotal: ev.target.value })} placeholder="0" />
                              </div>
                            </div>

                            {/* Currency + Monto */}
                            <div>
                              <div className="flex gap-2 mb-2">
                                <button type="button" onClick={() => updateEdit(l.id, { currency: "USD" })}
                                  className={`flex-1 py-1.5 rounded-lg text-xs border ${e.currency === "USD" ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]" : "border-[var(--card-border)] text-[var(--muted)]"}`}>USD</button>
                                <button type="button" onClick={() => updateEdit(l.id, { currency: "ARS" })}
                                  className={`flex-1 py-1.5 rounded-lg text-xs border ${e.currency === "ARS" ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]" : "border-[var(--card-border)] text-[var(--muted)]"}`}>ARS</button>
                              </div>
                              <label className={labelClass}>Monto cobrado hoy ({e.currency})</label>
                              <input type="number" className={inputClass} value={e.monto} onChange={(ev) => updateEdit(l.id, { monto: ev.target.value })} placeholder="0" />
                              {e.monto && parseFloat(e.monto) > 0 && (
                                <p className="text-xs text-[var(--muted)] mt-1">
                                  ≈ {e.currency === "ARS" ? formatUSD(Math.round(parseFloat(e.monto) / usdRate)) : `$${Math.round(parseFloat(e.monto) * usdRate).toLocaleString("es-AR")} ARS`}
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={labelClass}>Fecha de pago</label>
                                <input type="date" className={inputClass} value={e.fechaPago} onChange={(ev) => updateEdit(l.id, { fechaPago: ev.target.value })} />
                              </div>
                              <div>
                                <label className={labelClass}>Método</label>
                                <select className={inputClass} value={e.metodoPago} onChange={(ev) => updateEdit(l.id, { metodoPago: ev.target.value })}>
                                  <option value="">...</option>
                                  {METODOS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className={labelClass}>Recibió</label>
                              <select className={inputClass} value={e.receptor} onChange={(ev) => updateEdit(l.id, { receptor: ev.target.value })}>
                                <option value="">...</option>
                                {RECEPTORES.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>

                            <div>
                              <label className={labelClass}>Comprobante</label>
                              <input type="file" accept="image/*,.pdf" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) uploadComprobante(l.id, f); }}
                                className="text-xs text-[var(--muted)]" />
                              {e.comprobanteUrl && <p className="text-xs text-[var(--green)] mt-1">✓ Subido</p>}
                            </div>
                          </div>
                        )}

                        {/* Notas */}
                        <div>
                          <label className={labelClass}>Notas / detalles</label>
                          <textarea className={`${inputClass} h-20 resize-none`} value={e.notas} onChange={(ev) => updateEdit(l.id, { notas: ev.target.value })} placeholder="Contexto de la llamada, objeciones, etc." />
                        </div>

                        {e.error && <p className="text-xs text-red-400">{e.error}</p>}

                        <button
                          onClick={() => saveLead(l.id)}
                          disabled={savingId === l.id || !e.sePresento || (e.sePresento === "si" && !e.estado)}
                          className="w-full bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium"
                        >
                          {savingId === l.id ? "Guardando..." : e.submitted ? "Actualizar" : "Guardar lead"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
