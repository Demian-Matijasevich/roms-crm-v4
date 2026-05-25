"use client";

import { useState, useMemo, useCallback, Fragment } from "react";
import type { TeamMember, AuthSession, LeadScore, Payment } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { LEAD_ESTADOS_LABELS, PROGRAMS } from "@/lib/constants";
import { formatUSD, formatDate, formatMoney } from "@/lib/format";
import { getFiscalMonthOptions, getFiscalEnd, parseLocalDate, toDateString } from "@/lib/date-utils";
import StatusBadge from "@/app/components/StatusBadge";
import AddPaymentModal from "@/app/components/AddPaymentModal";
import AddLeadModal from "@/app/components/AddLeadModal";
import PaymentEditModalShared, { type EditablePayment } from "@/app/components/PaymentEditModalShared";

interface Props {
  leads: LeadWithTeam[];
  closers: TeamMember[];
  setters: TeamMember[];
  payments: Payment[];
  usdRate: number;
  session: AuthSession;
}

const SCORE_COLORS: Record<string, string> = {
  A: "bg-green-500/15 text-green-400 border-green-500/20",
  B: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  C: "bg-orange-400/15 text-orange-400 border-orange-400/20",
  D: "bg-red-500/15 text-red-400 border-red-500/20",
};

function LeadScoreBadge({ score }: { score: LeadScore | null }) {
  if (!score) return <span className="text-xs text-muted">--</span>;
  const color = SCORE_COLORS[score] || "bg-gray-500/15 text-gray-400 border-gray-500/20";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {score}
    </span>
  );
}

// Sort direction type
type SortDir = "asc" | "desc" | null;
type SortKey = "nombre" | "fecha" | "cash" | "ticket" | "saldo";

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <span className="ml-1 text-[10px] opacity-40">&#8597;</span>;
  return <span className="ml-1 text-[10px] text-[var(--purple-light)]">{dir === "asc" ? "\u2191" : "\u2193"}</span>;
}

export default function LlamadasClient({ leads: initialLeads, closers, setters, payments, usdRate, session }: Props) {
  const [leads, setLocalLeads] = useState<LeadWithTeam[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("todos");
  const [closerFilter, setCloserFilter] = useState<string>("todos");
  const [setterFilter, setSetterFilter] = useState<string>("todos");
  const [monthFilter, setMonthFilter] = useState<string>("todos");
  const [pagoFilter, setPagoFilter] = useState<string>("todos");
  const [programaFilter, setProgramaFilter] = useState<string>("todos");
  const [calificadoFilter, setCalificadoFilter] = useState<string>("todos");
  const [fuenteFilter, setFuenteFilter] = useState<string>("todos");
  const [tipoOrigenFilter, setTipoOrigenFilter] = useState<"todos" | "outbound" | "inbound" | "sin_setter">("todos");
  const [cashFilter, setCashFilter] = useState<"todos" | "con_cash" | "sin_cash">("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showEstadoCuenta, setShowEstadoCuenta] = useState<string | null>(null);
  const [showRefundForm, setShowRefundForm] = useState<string | null>(null);
  const [refundMonto, setRefundMonto] = useState("");
  const [refundMotivo, setRefundMotivo] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Inline edit state
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [addPaymentForLead, setAddPaymentForLead] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const handleSave = useCallback(async (leadId: string) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      // Sanitize: empty strings → null for nullable fields (dates, ids, optional text)
      const NULLABLE: Set<string> = new Set([
        "email", "telefono", "instagram", "fecha_agendado", "fecha_llamada",
        "closer_id", "setter_id", "cobrador_id",
        "fuente", "plan_pago", "concepto",
        "utm_source", "utm_medium", "utm_content",
        "programa_pitcheado", "lead_calificado",
      ]);
      const payload: Record<string, unknown> = { id: leadId };
      for (const [k, v] of Object.entries(editData)) {
        if (k.startsWith("_")) continue;
        if (k === "etiquetas" && typeof v === "string") {
          payload.etiquetas = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
          continue;
        }
        if (v === "" && NULLABLE.has(k)) payload[k] = null;
        else payload[k] = v;
      }
      const res = await fetch("/api/llamadas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        setSaveMsg("Guardado correctamente");
        setTimeout(() => window.location.reload(), 800);
      } else {
        setSaveMsg(`Error: ${json.error || "desconocido"}`);
      }
    } catch {
      setSaveMsg("Error de red");
    } finally {
      setSaving(false);
    }
  }, [editData]);

  // Inline edit helper (for cells in the main table row — saves immediately on blur/change)
  const updateLeadField = useCallback(async (leadId: string, field: string, value: string | number | null) => {
    try {
      const res = await fetch("/api/llamadas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, [field]: value }),
      });
      const json = await res.json();
      if (json.ok && json.lead) {
        setLocalLeads((prev) => prev.map((l) => {
          if (l.id !== leadId) return l;
          const updated = { ...l, [field]: value } as LeadWithTeam;
          if (field === "closer_id") {
            const c = closers.find((t) => t.id === value);
            updated.closer = c || null;
          }
          if (field === "setter_id") {
            const s = setters.find((t) => t.id === value);
            updated.setter = s || null;
          }
          return updated;
        }));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [closers, setters]);

  // Update a specific payment's field (used from the main table row for fecha_pago of the first payment)
  const updatePaymentField = useCallback(async (paymentId: string, field: string, value: string | number | null) => {
    try {
      const res = await fetch("/api/pagos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, [field]: value }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert("Error: " + (json.error || "desconocido"));
        return;
      }
      // Force reload to refresh audit data (payments is computed server-side).
      // Alternative would be to mutate a local payments state — for now this is simpler.
      window.location.reload();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  // Renders the expanded lead detail inside the table row (inline expand)
  const renderLeadDetail = (lead: LeadWithTeam) => {
    const leadPayments = paymentsByLead.get(lead.id) || [];
    const audit = getAuditData(lead.id, lead.ticket_total);

    // Initialize edit data when expanding a different lead
    if (editData._leadId !== lead.id) {
      setTimeout(() => {
        setEditData({
          _leadId: lead.id,
          estado: lead.estado,
          programa_pitcheado: lead.programa_pitcheado || "",
          lead_calificado: lead.lead_calificado || "",
          ticket_total: lead.ticket_total,
          notas_internas: lead.notas_internas || "",
          reporte_general: lead.reporte_general || "",
          nombre: lead.nombre || "",
          email: lead.email || "",
          telefono: lead.telefono || "",
          instagram: lead.instagram || "",
          fecha_agendado: lead.fecha_agendado ? lead.fecha_agendado.split("T")[0] : "",
          fecha_llamada: lead.fecha_llamada ? lead.fecha_llamada.split("T")[0] : "",
          closer_id: lead.closer_id || "",
          setter_id: lead.setter_id || "",
          fuente: lead.fuente || "",
          plan_pago: lead.plan_pago || "",
          concepto: lead.concepto || "",
          utm_source: lead.utm_source || "",
          utm_medium: lead.utm_medium || "",
          utm_content: lead.utm_content || "",
          etiquetas: (lead.etiquetas || []).join(", "),
        });
        setSaveMsg(null);
      }, 0);
    }

    return (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{lead.nombre}</h3>
              <button
                onClick={() => setExpandedId(null)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg"
              >
                &times;
              </button>
            </div>

            {/* ── Section Grid: 3 columns ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* Contacto */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Contacto</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Email</span>
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="text-blue-400 hover:underline truncate ml-2">{lead.email}</a>
                    ) : <span className="text-[var(--muted)]">---</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Telefono</span>
                    {lead.telefono ? (
                      <a href={`tel:${lead.telefono}`} className="text-blue-400 hover:underline">{lead.telefono}</a>
                    ) : <span className="text-[var(--muted)]">---</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Instagram</span>
                    {lead.instagram ? (
                      <a href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        @{lead.instagram.replace(/^@/, "")}
                      </a>
                    ) : <span className="text-[var(--muted)]">---</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Fuente</span>
                    <span>{lead.fuente || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Detalles */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Detalles</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Fecha Agenda</span>
                    <span>{formatDate(lead.fecha_agendado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Se Presento</span>
                    <span>{lead.estado === "no_show" ? "No" : lead.fecha_llamada ? "Si" : "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Calificado</span>
                    <span>{lead.lead_calificado ? lead.lead_calificado.replace(/_/g, " ") : "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Cash Total</span>
                    <span className="font-mono text-green-400">{formatUSD(audit.cashCollected)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Decisor</span>
                    <span>{lead.decisor || "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Exp. Ecommerce</span>
                    <span>{lead.experiencia_ecommerce || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Pagos */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Pagos</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Plan</span>
                    <span>{lead.plan_pago?.replace(/_/g, " ") || "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Metodo</span>
                    <span>{leadPayments[0]?.metodo_pago?.replace(/_/g, " ") || "---"}</span>
                  </div>
                  {leadPayments.length > 0 ? (
                    leadPayments
                      .sort((a, b) => a.numero_cuota - b.numero_cuota)
                      .map((p) => (
                        <div key={p.id} className="flex justify-between items-center gap-2 py-1 border-b border-[var(--card-border)]/30 last:border-0">
                          <div className="flex flex-col text-[11px] flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--muted)]">#{p.numero_cuota}</span>
                              <span className="font-mono text-white">{formatMoney(p.monto_usd, p.monto_ars, usdRate)}</span>
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                                p.estado === "pagado" ? "bg-green-500/15 text-green-400 border-green-500/20" :
                                p.estado === "pendiente" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" :
                                p.estado === "perdido" ? "bg-red-500/15 text-red-400 border-red-500/20" :
                                "bg-orange-400/15 text-orange-400 border-orange-400/20"
                              }`}>
                                {p.estado}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--muted)] truncate">
                              {p.fecha_pago ? formatDate(p.fecha_pago) : "sin fecha"}
                              {p.metodo_pago && ` · ${p.metodo_pago.replace(/_/g, " ")}`}
                              {p.receptor && ` · ${p.receptor}`}
                            </div>
                          </div>
                          <button
                            onClick={() => setEditingPayment(p)}
                            className="text-[10px] bg-[var(--purple)]/20 hover:bg-[var(--purple)]/40 text-[var(--purple-light)] px-2 py-0.5 rounded shrink-0"
                          >
                            ✏️
                          </button>
                        </div>
                      ))
                  ) : (
                    <p className="text-[var(--muted)] text-xs">Sin pagos registrados</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contextos */}
            {(lead.contexto_setter || lead.reporte_general) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--card-border)]">
                {lead.contexto_setter && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider mb-1">Contexto Setter</h4>
                    <p className="text-sm leading-relaxed bg-white/5 rounded-lg p-3">{lead.contexto_setter}</p>
                  </div>
                )}
                {lead.reporte_general && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider mb-1">Contexto Closer</h4>
                    <p className="text-sm leading-relaxed bg-white/5 rounded-lg p-3">{lead.reporte_general}</p>
                  </div>
                )}
              </div>
            )}

            {/* Inline Edit Form */}
            <div className="pt-3 border-t border-[var(--card-border)] space-y-4">
              <h4 className="text-sm font-semibold text-[var(--purple-light)]">Editar lead (todos los campos)</h4>

              {/* Contacto */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Nombre</label>
                  <input type="text"
                    value={(editData.nombre as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, nombre: e.target.value })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Email</label>
                  <input type="email"
                    value={(editData.email as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value || null })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Telefono</label>
                  <input type="tel"
                    value={(editData.telefono as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, telefono: e.target.value || null })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Instagram</label>
                  <input type="text"
                    value={(editData.instagram as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, instagram: e.target.value || null })}
                    className={inputClass} placeholder="@usuario" />
                </div>
              </div>

              {/* Estado / Calificación / Programa / Ticket */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Estado</label>
                  <select
                    value={(editData.estado as string) || lead.estado}
                    onChange={(e) => setEditData({ ...editData, estado: e.target.value })}
                    className={selectClass}
                  >
                    {estadoOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Programa pitcheado</label>
                  <select
                    value={(editData.programa_pitcheado as string) || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__otro__") {
                        const custom = window.prompt("Nuevo programa (slug, ej: ecommerce_pro):");
                        if (custom && custom.trim()) setEditData({ ...editData, programa_pitcheado: custom.trim() });
                      } else {
                        setEditData({ ...editData, programa_pitcheado: v || null });
                      }
                    }}
                    className={selectClass}
                  >
                    <option value="">Sin programa</option>
                    {Object.entries(PROGRAMS).map(([key, p]) => (
                      <option key={key} value={key}>{p.label}</option>
                    ))}
                    {typeof editData.programa_pitcheado === "string" && editData.programa_pitcheado && !PROGRAMS[editData.programa_pitcheado] && (
                      <option value={editData.programa_pitcheado}>{editData.programa_pitcheado}</option>
                    )}
                    <option value="__otro__">+ Otro (escribir nuevo)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Lead calificado</label>
                  <select
                    value={(editData.lead_calificado as string) || ""}
                    onChange={(e) => setEditData({ ...editData, lead_calificado: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">---</option>
                    <option value="calificado">Calificado</option>
                    <option value="no_calificado">No calificado</option>
                    <option value="podria">Podria</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Ticket total (USD)</label>
                  <input
                    type="number"
                    value={(editData.ticket_total as number) ?? lead.ticket_total}
                    onChange={(e) => setEditData({ ...editData, ticket_total: Number(e.target.value) })}
                    className={inputClass}
                    min={0}
                    step={100}
                  />
                </div>
              </div>

              {/* Asignaciones + Fechas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Closer</label>
                  <select
                    value={(editData.closer_id as string) || ""}
                    onChange={(e) => setEditData({ ...editData, closer_id: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">Sin closer</option>
                    {closers.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Setter</label>
                  <select
                    value={(editData.setter_id as string) || ""}
                    onChange={(e) => setEditData({ ...editData, setter_id: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">Sin setter</option>
                    {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Fecha agendado</label>
                  <input type="date"
                    value={(editData.fecha_agendado as string) || ""}
                    onChange={(e) => setEditData({ ...editData, fecha_agendado: e.target.value || null })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Fecha llamada</label>
                  <input type="date"
                    value={(editData.fecha_llamada as string) || ""}
                    onChange={(e) => setEditData({ ...editData, fecha_llamada: e.target.value || null })}
                    className={inputClass} />
                </div>
              </div>

              {/* Fuente + UTMs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Fuente</label>
                  <input type="text"
                    value={(editData.fuente as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, fuente: e.target.value || null })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">UTM source</label>
                  <input type="text"
                    value={(editData.utm_source as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, utm_source: e.target.value || null })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">UTM medium</label>
                  <input type="text"
                    value={(editData.utm_medium as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, utm_medium: e.target.value || null })}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">UTM content</label>
                  <input type="text"
                    value={(editData.utm_content as string) ?? ""}
                    onChange={(e) => setEditData({ ...editData, utm_content: e.target.value || null })}
                    className={inputClass} />
                </div>
              </div>

              {/* Plan + Concepto */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Plan pago</label>
                  <select
                    value={(editData.plan_pago as string) || ""}
                    onChange={(e) => setEditData({ ...editData, plan_pago: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">---</option>
                    <option value="cash">Cash</option>
                    <option value="2_cuotas">2 cuotas</option>
                    <option value="3_cuotas">3 cuotas</option>
                    <option value="4_cuotas">4 cuotas</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Concepto</label>
                  <select
                    value={(editData.concepto as string) || ""}
                    onChange={(e) => setEditData({ ...editData, concepto: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">---</option>
                    <option value="reserva">Reserva</option>
                    <option value="pago_total">Pago total</option>
                    <option value="cuota_1">Cuota 1</option>
                    <option value="cuota_2">Cuota 2</option>
                  </select>
                </div>
              </div>

              {/* Notas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Notas internas</label>
                  <textarea
                    value={(editData.notas_internas as string) || ""}
                    onChange={(e) => setEditData({ ...editData, notas_internas: e.target.value })}
                    className={`${inputClass} w-full min-h-[80px] resize-y`}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Reporte general</label>
                  <textarea
                    value={(editData.reporte_general as string) || ""}
                    onChange={(e) => setEditData({ ...editData, reporte_general: e.target.value })}
                    className={`${inputClass} w-full min-h-[80px] resize-y`}
                    rows={3}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-[var(--muted)] mb-1 block">
                    Etiquetas <span className="text-[10px] opacity-70">(separadas por coma)</span>
                  </label>
                  <input
                    type="text"
                    value={(editData.etiquetas as string) || ""}
                    onChange={(e) => setEditData({ ...editData, etiquetas: e.target.value })}
                    placeholder="urgente, alto-ticket, frio, recontactar..."
                    className={`${inputClass} w-full`}
                  />
                  {(editData.etiquetas as string) && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {(editData.etiquetas as string)
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-[var(--purple)]/10 border border-[var(--purple)]/30 text-[var(--purple-light)] rounded px-1.5 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSave(lead.id)}
                  disabled={saving}
                  className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => setAddPaymentForLead(lead.id)}
                  disabled={saving}
                  className="text-sm font-medium bg-[var(--green)]/20 hover:bg-[var(--green)]/40 border border-[var(--green)]/40 text-[var(--green)] px-4 py-2 rounded-lg transition-colors"
                >
                  💵 Cargar pago / cash
                </button>
                {saveMsg && (
                  <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => setShowEstadoCuenta(showEstadoCuenta === lead.id ? null : lead.id)}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                  showEstadoCuenta === lead.id
                    ? "bg-[var(--purple)] text-white"
                    : "bg-[var(--purple)]/15 border border-[var(--purple)]/30 text-[var(--purple-light)] hover:bg-[var(--purple)]/25"
                }`}
              >
                {showEstadoCuenta === lead.id ? "Cerrar Estado de Cuenta" : "Estado de Cuenta"}
              </button>
              <button
                onClick={() => {
                  setShowRefundForm(showRefundForm === lead.id ? null : lead.id);
                  setRefundMonto("");
                  setRefundMotivo("");
                  setRefundMsg(null);
                }}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                  showRefundForm === lead.id
                    ? "bg-red-500 text-white"
                    : "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                }`}
              >
                {showRefundForm === lead.id ? "Cerrar Refund" : "Refund"}
              </button>
              <a
                href="/form/llamada"
                className="text-sm font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] px-4 py-2 rounded-lg transition-colors"
              >
                Cargar resultado
              </a>
              <a
                href="/pipeline"
                className="text-sm font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] px-4 py-2 rounded-lg transition-colors"
              >
                Ver en pipeline
              </a>
            </div>

            {/* Inline Refund Form */}
            {showRefundForm === lead.id && (
              <div className="mt-4 pt-4 border-t border-[var(--card-border)] space-y-4">
                <h4 className="text-sm font-semibold text-red-400">Cargar Refund</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-[var(--muted)] mb-1 block">Monto a devolver (USD) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={refundMonto}
                        onChange={(e) => setRefundMonto(e.target.value)}
                        placeholder="0"
                        className={`${inputClass} pl-7`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)] mb-1 block">Motivo del refund</label>
                    <textarea
                      value={refundMotivo}
                      onChange={(e) => setRefundMotivo(e.target.value)}
                      rows={2}
                      placeholder="Razon del refund..."
                      className={`${inputClass} w-full resize-none`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleRefundSubmit(lead.id)}
                    disabled={refundLoading}
                    className="text-sm font-medium bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {refundLoading ? "Procesando..." : "Confirmar Refund"}
                  </button>
                  {refundMsg && (
                    <span className={`text-sm ${refundMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                      {refundMsg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Inline Estado de Cuenta */}
            {showEstadoCuenta === lead.id && (() => {
              const pagados = leadPayments.filter((p) => p.estado === "pagado");
              const pendientes = leadPayments.filter((p) => p.estado === "pendiente");
              const perdidos = leadPayments.filter((p) => p.estado === "perdido");
              const refunds = leadPayments.filter((p) => p.estado === "refund");
              const totalRefund = refunds.reduce((sum, p) => sum + p.monto_usd, 0);
              const totalPagado = pagados.reduce((sum, p) => sum + p.monto_usd, 0);
              const totalPendiente = pendientes.reduce((sum, p) => sum + p.monto_usd, 0);
              const totalPerdido = perdidos.reduce((sum, p) => sum + p.monto_usd, 0);
              const saldo = lead.ticket_total - totalPagado;

              return (
                <div id={`estado-cuenta-${lead.id}`} className="mt-4 pt-4 border-t border-[var(--card-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--purple-light)]">Estado de Cuenta</h4>
                    <button
                      onClick={() => {
                        const el = document.getElementById(`estado-cuenta-${lead.id}`);
                        if (!el) return;
                        const printWindow = window.open("", "_blank");
                        if (!printWindow) return;
                        printWindow.document.write(`
                          <html><head><title>Estado de Cuenta - ${lead.nombre}</title>
                          <style>
                            body { font-family: system-ui, sans-serif; padding: 2rem; color: #000; }
                            table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
                            th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
                            th { background: #f3f4f6; font-weight: 600; }
                            .green { color: #15803d; } .yellow { color: #a16207; } .red { color: #b91c1c; }
                            .summary { border-top: 2px solid #000; padding-top: 1rem; margin-top: 1rem; }
                            .summary div { display: flex; justify-content: space-between; padding: 4px 0; }
                          </style></head><body>
                          <h1>Estado de Cuenta — ${lead.nombre}</h1>
                          <p>Ticket total: $${lead.ticket_total.toLocaleString()}</p>
                          ${el.querySelector("table")?.outerHTML || ""}
                          <div class="summary">
                            <div><span>Total Pagado</span><span class="green">$${totalPagado.toLocaleString()}</span></div>
                            <div><span>Cuotas Pendientes</span><span class="yellow">$${totalPendiente.toLocaleString()}</span></div>
                            ${totalPerdido > 0 ? `<div><span>Perdido / Refund</span><span class="red">$${totalPerdido.toLocaleString()}</span></div>` : ""}
                            <div style="border-top:1px solid #ddd;padding-top:8px;margin-top:8px"><span><b>Saldo Pendiente</b></span><span class="${saldo > 0 ? "red" : "green"}"><b>$${saldo.toLocaleString()}</b></span></div>
                          </div>
                          </body></html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }}
                      className="text-xs font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] px-3 py-1 rounded-lg transition-colors"
                    >
                      Imprimir
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--card-border)] text-left">
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">#</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Monto USD</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Estado</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Fecha Pago</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Vencimiento</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Receptor</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium w-20">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadPayments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-4 text-[var(--muted)]">
                              Sin pagos registrados
                            </td>
                          </tr>
                        ) : (
                          leadPayments
                            .sort((a, b) => a.numero_cuota - b.numero_cuota)
                            .map((p) => (
                              <tr key={p.id} className="border-b border-[var(--card-border)]/50">
                                <td className="px-3 py-2">#{p.numero_cuota}</td>
                                <td className="px-3 py-2 font-mono font-medium">{formatMoney(p.monto_usd, p.monto_ars, usdRate)}</td>
                                <td className={`px-3 py-2 font-medium ${
                                  p.estado === "pagado" ? "text-green-400" :
                                  p.estado === "pendiente" ? "text-yellow-400" :
                                  p.estado === "perdido" ? "text-red-400" :
                                  p.estado === "refund" ? "text-orange-400" : ""
                                }`}>
                                  {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                                </td>
                                <td className="px-3 py-2 text-[var(--muted)]">{formatDate(p.fecha_pago)}</td>
                                <td className="px-3 py-2 text-[var(--muted)]">{formatDate(p.fecha_vencimiento)}</td>
                                <td className="px-3 py-2 text-[var(--muted)]">{p.receptor ?? "---"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingPayment(p); }}
                                      className="text-xs text-[var(--purple)] hover:underline"
                                    >
                                      Editar
                                    </button>
                                    <span className="text-[var(--muted)]">·</span>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!confirm(`¿Borrar pago de ${formatUSD(p.monto_usd)}?`)) return;
                                        const res = await fetch(`/api/pagos?id=${p.id}`, { method: "DELETE" });
                                        if ((await res.json()).ok) window.location.reload();
                                      }}
                                      className="text-xs text-red-400 hover:underline"
                                    >
                                      Borrar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 text-sm pt-2 border-t border-[var(--card-border)]">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Total Pagado</span>
                      <span className="font-bold text-green-400">{formatUSD(totalPagado)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Cuotas Pendientes</span>
                      <span className="font-bold text-yellow-400">{formatUSD(totalPendiente)}</span>
                    </div>
                    {totalPerdido > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Perdido</span>
                        <span className="font-bold text-red-400">{formatUSD(totalPerdido)}</span>
                      </div>
                    )}
                    {totalRefund > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Refunds</span>
                        <span className="font-bold text-orange-400">-{formatUSD(totalRefund)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[var(--card-border)] pt-2 mt-2">
                      <span className="font-semibold">Saldo Pendiente (Ticket - Pagado)</span>
                      <span className={`font-bold ${saldo > 0 ? "text-red-400" : "text-green-400"}`}>
                        {formatUSD(saldo)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
    );
  };


  const handleRefundSubmit = useCallback(async (leadId: string) => {
    const monto = parseFloat(refundMonto);
    if (!monto || monto <= 0) {
      setRefundMsg("Ingresa un monto valido");
      return;
    }
    setRefundLoading(true);
    setRefundMsg(null);
    try {
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          numero_cuota: 1,
          monto_usd: monto,
          monto_ars: 0,
          fecha_pago: new Date().toISOString().split("T")[0],
          estado: "refund",
          metodo_pago: "transferencia",
          receptor: refundMotivo || "Refund",
          es_renovacion: false,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setRefundMsg("Refund registrado correctamente");
        setRefundMonto("");
        setRefundMotivo("");
        setTimeout(() => window.location.reload(), 800);
      } else {
        setRefundMsg(`Error: ${json.error || "desconocido"}`);
      }
    } catch {
      setRefundMsg("Error de red");
    } finally {
      setRefundLoading(false);
    }
  }, [refundMonto, refundMotivo]);

  const monthOptions = useMemo(() => getFiscalMonthOptions(12), []);

  // Group payments by lead_id for O(1) lookups
  const paymentsByLead = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of payments) {
      if (!p.lead_id) continue;
      const arr = map.get(p.lead_id);
      if (arr) arr.push(p);
      else map.set(p.lead_id, [p]);
    }
    return map;
  }, [payments]);

  // Month filter range (for filtering payments by fecha_pago within the selected month)
  const monthRange = useMemo(() => {
    if (monthFilter === "todos") return null;
    const start = parseLocalDate(monthFilter);
    const end = getFiscalEnd(start);
    const startStr = toDateString(start);
    const endStr = toDateString(end);
    return { startStr, endStr };
  }, [monthFilter]);

  // Helper: get audit data for a lead
  const getAuditData = useCallback(
    (leadId: string, ticketTotal: number) => {
      const leadPayments = paymentsByLead.get(leadId) || [];
      const pagados = leadPayments.filter((p) => p.estado === "pagado");
      // When filtering by month: only sum payments within the filtered month
      const inMonthPagados = monthRange
        ? pagados.filter((p) => {
            const f = p.fecha_pago?.split("T")[0];
            return f && f >= monthRange.startStr && f <= monthRange.endStr;
          })
        : pagados;
      const cashCollected = inMonthPagados.reduce((sum, p) => sum + p.monto_usd, 0);
      const cuotasPagadas = inMonthPagados.filter((p) => p.numero_cuota > 1).length;
      const saldoPendiente = monthRange ? 0 : ticketTotal - cashCollected;
      const receptor = leadPayments.length > 0 ? leadPayments[0].receptor : null;
      const withFecha = inMonthPagados
        .filter((p) => p.fecha_pago)
        .sort((a, b) => (a.fecha_pago || "").localeCompare(b.fecha_pago || ""));
      const fechaPago = withFecha[0]?.fecha_pago?.split("T")[0] || null;
      const fechaPagoPaymentId = withFecha[0]?.id || null;
      return { cashCollected, cuotasPagadas, saldoPendiente, receptor, fechaPago, fechaPagoPaymentId };
    },
    [paymentsByLead, monthRange]
  );

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch =
          lead.nombre?.toLowerCase().includes(q) ||
          lead.instagram?.toLowerCase().includes(q) ||
          lead.email?.toLowerCase().includes(q) ||
          lead.telefono?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Estado filter
      if (estadoFilter !== "todos" && lead.estado !== estadoFilter) return false;

      // Closer filter
      if (closerFilter !== "todos" && lead.closer_id !== closerFilter) return false;

      // Setter filter
      if (setterFilter !== "todos" && lead.setter_id !== setterFilter) return false;

      // Programa filter
      if (programaFilter !== "todos" && lead.programa_pitcheado !== programaFilter) return false;

      // Calificado filter
      if (calificadoFilter !== "todos") {
        if (calificadoFilter === "si" && lead.lead_calificado !== "calificado") return false;
        if (calificadoFilter === "no" && lead.lead_calificado === "calificado") return false;
      }

      // Month filter: include lead if fecha_llamada, fecha_agendado, OR any payment fecha_pago falls in the month
      if (monthFilter !== "todos") {
        const monthStart = parseLocalDate(monthFilter);
        const monthEnd = getFiscalEnd(monthStart);
        const startStr = toDateString(monthStart);
        const endStr = toDateString(monthEnd);
        const inRange = (v: string | null | undefined) => {
          if (!v) return false;
          const s = v.split("T")[0];
          return s >= startStr && s <= endStr;
        };
        const leadPays = paymentsByLead.get(lead.id) || [];
        const hasPagoInMonth = leadPays.some((p) => p.estado === "pagado" && inRange(p.fecha_pago));
        const llamadaInMonth = inRange(lead.fecha_llamada);
        const agendaInMonth = inRange(lead.fecha_agendado);
        if (!llamadaInMonth && !agendaInMonth && !hasPagoInMonth) return false;
      }

      // Payment filter
      if (pagoFilter !== "todos") {
        const leadPayments = paymentsByLead.get(lead.id) || [];
        const hasPago = leadPayments.some(p => p.estado === "pagado" && p.monto_usd > 0);
        if (pagoFilter === "solo_ventas" && lead.estado !== "cerrado" && lead.estado !== "adentro_seguimiento") return false;
        if (pagoFilter === "con_pago" && !hasPago) return false;
        if (pagoFilter === "sin_pago" && hasPago) return false;
      }

      // Fuente filter
      if (fuenteFilter !== "todos" && lead.fuente !== fuenteFilter) return false;

      // Tipo origen (outbound/inbound) filter
      if (tipoOrigenFilter !== "todos") {
        const hasSetter = !!lead.setter_id;
        const hasUtmMedium = !!lead.utm_medium;
        if (tipoOrigenFilter === "outbound" && !(hasSetter && !hasUtmMedium)) return false;
        if (tipoOrigenFilter === "inbound" && !hasUtmMedium) return false;
        if (tipoOrigenFilter === "sin_setter" && hasSetter) return false;
      }

      // Cash filter
      if (cashFilter !== "todos") {
        const leadPayments = paymentsByLead.get(lead.id) || [];
        const totalCash = leadPayments.filter(p => p.estado === "pagado").reduce((s, p) => s + p.monto_usd, 0);
        if (cashFilter === "con_cash" && totalCash <= 0) return false;
        if (cashFilter === "sin_cash" && totalCash > 0) return false;
      }

      // Custom date range (aplica a fecha_llamada o fecha_agendado)
      if (dateFrom || dateTo) {
        const ll = lead.fecha_llamada?.split("T")[0];
        const ag = lead.fecha_agendado?.split("T")[0];
        const dateToCheck = ll || ag;
        if (!dateToCheck) return false;
        if (dateFrom && dateToCheck < dateFrom) return false;
        if (dateTo && dateToCheck > dateTo) return false;
      }

      return true;
    });
  }, [leads, search, estadoFilter, closerFilter, setterFilter, monthFilter, programaFilter, calificadoFilter, pagoFilter, fuenteFilter, tipoOrigenFilter, cashFilter, dateFrom, dateTo, paymentsByLead]);

  // Sorted data
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const auditA = getAuditData(a.id, a.ticket_total);
      const auditB = getAuditData(b.id, b.ticket_total);
      switch (sortKey) {
        case "nombre":
          return dir * (a.nombre || "").localeCompare(b.nombre || "");
        case "fecha":
          return dir * (a.fecha_llamada || "").localeCompare(b.fecha_llamada || "");
        case "cash":
          return dir * (auditA.cashCollected - auditB.cashCollected);
        case "ticket":
          return dir * (a.ticket_total - b.ticket_total);
        case "saldo":
          return dir * (auditA.saldoPendiente - auditB.saldoPendiente);
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir, getAuditData]);

  // Summary totals
  const totals = useMemo(() => {
    let totalTicket = 0;
    let totalCash = 0;
    let totalSaldo = 0;
    for (const lead of filtered) {
      const audit = getAuditData(lead.id, lead.ticket_total);
      totalTicket += lead.ticket_total;
      totalCash += audit.cashCollected;
      totalSaldo += audit.saldoPendiente;
    }
    return { totalTicket, totalCash, totalSaldo };
  }, [filtered, getAuditData]);

  // CSV export
  const handleExportCSV = useCallback(() => {
    const headers = [
      "Nombre", "Instagram", "Fecha", "Estado", "Closer", "Setter",
      "Ticket Total", "Score", "Cash Collected", "Cuotas Pagadas",
      "Saldo Pendiente", "Receptor",
    ];

    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const rows = filtered.map((lead) => {
      const audit = getAuditData(lead.id, lead.ticket_total);
      return [
        lead.nombre || "",
        lead.instagram ? `@${lead.instagram.replace(/^@/, "")}` : "",
        lead.fecha_llamada || "",
        LEAD_ESTADOS_LABELS[lead.estado] || lead.estado,
        lead.closer?.nombre || "",
        lead.setter?.nombre || "",
        lead.ticket_total.toString(),
        lead.lead_score || "",
        audit.cashCollected.toString(),
        audit.cuotasPagadas.toString(),
        audit.saldoPendiente.toString(),
        audit.receptor || "",
      ].map(escapeCSV);
    });

    rows.push([
      "TOTALES", "", "", "", "", "",
      totals.totalTicket.toString(), "",
      totals.totalCash.toString(), "",
      totals.totalSaldo.toString(), "", "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `llamadas_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, getAuditData, totals]);

  const estadoOptions = Object.entries(LEAD_ESTADOS_LABELS);

  const inputClass =
    "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";
  const selectClass = inputClass;

  // Suppress unused variable warning
  void session;

  const thSortClass = "px-4 py-3 text-[var(--muted)] font-medium cursor-pointer select-none hover:text-[var(--foreground)] transition-colors";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Llamadas</h1>
          <p className="text-sm text-[var(--muted)]">
            {filtered.length} de {leads.length} leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddLead(true)}
            className="text-sm font-medium bg-[var(--green)] hover:bg-[var(--green)]/80 text-white px-4 py-2 rounded-lg transition-colors"
          >
            + Nuevo lead
          </button>
          <button
            onClick={handleExportCSV}
            className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg transition-colors"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre, IG, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} w-64`}
        />

        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los estados</option>
          {estadoOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

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

        <select
          value={programaFilter}
          onChange={(e) => setProgramaFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los programas</option>
          {Object.entries(PROGRAMS).map(([key, p]) => (
            <option key={key} value={key}>{p.label}</option>
          ))}
        </select>

        <select
          value={calificadoFilter}
          onChange={(e) => setCalificadoFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Calificado: Todos</option>
          <option value="si">Calificado: Si</option>
          <option value="no">Calificado: No</option>
        </select>

        <select
          value={pagoFilter}
          onChange={(e) => setPagoFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los pagos</option>
          <option value="solo_ventas">Solo ventas (cerradas)</option>
          <option value="con_pago">Con pago registrado</option>
          <option value="sin_pago">Sin pago</option>
        </select>

        <select
          value={tipoOrigenFilter}
          onChange={(e) => setTipoOrigenFilter(e.target.value as typeof tipoOrigenFilter)}
          className={selectClass}
        >
          <option value="todos">Origen: Todos</option>
          <option value="outbound">Outbound (setter directo)</option>
          <option value="inbound">Inbound (UTM medium)</option>
          <option value="sin_setter">Sin setter</option>
        </select>

        <select
          value={cashFilter}
          onChange={(e) => setCashFilter(e.target.value as typeof cashFilter)}
          className={selectClass}
        >
          <option value="todos">Cash: Todos</option>
          <option value="con_cash">Con cash {">"} 0</option>
          <option value="sin_cash">Sin cash</option>
        </select>

        <select
          value={fuenteFilter}
          onChange={(e) => setFuenteFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Fuente: Todas</option>
          {[...new Set(leads.map((l) => l.fuente).filter(Boolean))].sort().map((f) => (
            <option key={f as string} value={f as string}>{f}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className={inputClass}
          title="Desde (fecha llamada/agenda)"
          placeholder="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className={inputClass}
          title="Hasta (fecha llamada/agenda)"
          placeholder="Hasta"
        />

        {(tipoOrigenFilter !== "todos" || cashFilter !== "todos" || fuenteFilter !== "todos" || dateFrom || dateTo || estadoFilter !== "todos" || closerFilter !== "todos" || setterFilter !== "todos" || programaFilter !== "todos" || calificadoFilter !== "todos" || pagoFilter !== "todos" || monthFilter !== "todos" || search) && (
          <button
            onClick={() => {
              setSearch(""); setEstadoFilter("todos"); setCloserFilter("todos"); setSetterFilter("todos");
              setMonthFilter("todos"); setPagoFilter("todos"); setProgramaFilter("todos"); setCalificadoFilter("todos");
              setFuenteFilter("todos"); setTipoOrigenFilter("todos"); setCashFilter("todos");
              setDateFrom(""); setDateTo("");
            }}
            className="text-xs text-[var(--muted)] hover:text-white border border-[var(--card-border)] px-3 py-2 rounded-lg"
          >
            ✕ Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-left">
                <th className={thSortClass} onClick={() => toggleSort("nombre")}>
                  Nombre<SortIndicator active={sortKey === "nombre"} dir={sortKey === "nombre" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Instagram</th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">F. Agenda</th>
                <th className={thSortClass} onClick={() => toggleSort("fecha")}>
                  F. Llamada<SortIndicator active={sortKey === "fecha"} dir={sortKey === "fecha" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">F. Pago</th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Estado</th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Closer</th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Setter</th>
                <th className={`${thSortClass} text-right`} onClick={() => toggleSort("ticket")}>
                  Ticket<SortIndicator active={sortKey === "ticket"} dir={sortKey === "ticket" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium text-center">Score</th>
                <th className={`${thSortClass} text-right`} onClick={() => toggleSort("cash")}>
                  Cash<SortIndicator active={sortKey === "cash"} dir={sortKey === "cash" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium text-center">Cuotas</th>
                <th className={`${thSortClass} text-right`} onClick={() => toggleSort("saldo")}>
                  Saldo<SortIndicator active={sortKey === "saldo"} dir={sortKey === "saldo" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Receptor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-[var(--muted)]">
                    No se encontraron leads con esos filtros.
                  </td>
                </tr>
              )}
              {sorted.map((lead) => {
                const audit = getAuditData(lead.id, lead.ticket_total);
                const isExpanded = expandedId === lead.id;
                return (
                  <Fragment key={lead.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    className={`border-b border-[var(--card-border)] hover:bg-[var(--purple)]/5 cursor-pointer transition-colors ${isExpanded ? "bg-[var(--purple)]/5" : ""}`}
                  >
                    <td className="px-2 py-2 font-medium text-[var(--foreground)]" onClick={(e) => e.stopPropagation()}>
                      <input type="text" defaultValue={lead.nombre || ""}
                        onBlur={(e) => { if (e.target.value !== (lead.nombre || "")) updateLeadField(lead.id, "nombre", e.target.value); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-sm font-medium text-[var(--foreground)] focus:outline-none" />
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="text" defaultValue={lead.instagram || ""}
                        onBlur={(e) => { if (e.target.value !== (lead.instagram || "")) updateLeadField(lead.id, "instagram", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="date" defaultValue={lead.fecha_agendado?.split("T")[0] || ""}
                        onBlur={(e) => { const v = e.target.value || null; if (v !== (lead.fecha_agendado?.split("T")[0] || null)) updateLeadField(lead.id, "fecha_agendado", v ? `${v}T00:00:00` : null); }}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="date" defaultValue={lead.fecha_llamada?.split("T")[0] || ""}
                        onBlur={(e) => { const v = e.target.value || null; if (v !== (lead.fecha_llamada?.split("T")[0] || null)) updateLeadField(lead.id, "fecha_llamada", v ? `${v}T00:00:00` : null); }}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      {audit.fechaPagoPaymentId ? (
                        <input type="date" defaultValue={audit.fechaPago || ""}
                          onBlur={(e) => { const v = e.target.value; if (v && v !== audit.fechaPago) updatePaymentField(audit.fechaPagoPaymentId!, "fecha_pago", v); }}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                      ) : (
                        <span className="text-[var(--muted)]">---</span>
                      )}
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <select defaultValue={lead.estado}
                        onChange={(e) => updateLeadField(lead.id, "estado", e.target.value)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs focus:outline-none">
                        {Object.entries(LEAD_ESTADOS_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                      </select>
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <select defaultValue={lead.closer_id || ""}
                        onChange={(e) => updateLeadField(lead.id, "closer_id", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none">
                        <option value="">—</option>
                        {closers.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                      </select>
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <select defaultValue={lead.setter_id || ""}
                        onChange={(e) => updateLeadField(lead.id, "setter_id", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none">
                        <option value="">—</option>
                        {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right font-mono" onClick={(e) => e.stopPropagation()}>
                      <input type="number" step={100} defaultValue={lead.ticket_total || 0}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== (lead.ticket_total || 0)) updateLeadField(lead.id, "ticket_total", v); }}
                        className="w-24 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-right text-white focus:outline-none" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LeadScoreBadge score={lead.lead_score} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {audit.cashCollected > 0 ? (
                        <span className="text-green-400">{formatUSD(audit.cashCollected)}</span>
                      ) : (
                        "---"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {audit.cuotasPagadas > 0 ? audit.cuotasPagadas : "---"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {audit.saldoPendiente > 0 ? (
                        <span className="text-red-400">{formatUSD(audit.saldoPendiente)}</span>
                      ) : audit.saldoPendiente < 0 ? (
                        <span className="text-yellow-400">{formatUSD(audit.saldoPendiente)}</span>
                      ) : (
                        "---"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">
                      {audit.receptor || "---"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={14} className="p-0 border-b-2 border-[var(--purple)]/30">
                        <div className="bg-[var(--purple)]/5 px-4 py-4">
                          {renderLeadDetail(lead)}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
            {/* Footer totals row */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--purple)]/30 bg-[var(--purple)]/5 font-semibold">
                  <td className="px-4 py-3" colSpan={7}>
                    TOTALES ({filtered.length} leads)
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">
                    {formatUSD(totals.totalTicket)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-mono text-green-400">
                    {formatUSD(totals.totalCash)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-mono text-red-400">
                    {formatUSD(totals.totalSaldo)}
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>


      {editingPayment && (
        <PaymentEditModalShared
          payment={editingPayment as EditablePayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => { setEditingPayment(null); window.location.reload(); }}
          onDeleted={() => { setEditingPayment(null); window.location.reload(); }}
        />
      )}

      {addPaymentForLead && (
        <AddPaymentModal
          leads={leads.map((l) => ({ id: l.id, nombre: l.nombre }))}
          defaultLeadId={addPaymentForLead}
          onClose={() => setAddPaymentForLead(null)}
          onCreated={() => { setAddPaymentForLead(null); window.location.reload(); }}
        />
      )}

      {showAddLead && (
        <AddLeadModal
          closers={closers}
          setters={setters}
          onClose={() => setShowAddLead(false)}
          onCreated={() => { setShowAddLead(false); window.location.reload(); }}
        />
      )}
    </div>
  );
}

