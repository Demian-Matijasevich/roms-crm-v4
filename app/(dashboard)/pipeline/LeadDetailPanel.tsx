"use client";

import { useState } from "react";
import type { LeadWithTeam } from "@/lib/queries/leads";
import type { Payment, LeadEstado } from "@/lib/types";
import { LEAD_ESTADOS_LABELS } from "@/lib/constants";
import { formatUSD, formatDate } from "@/lib/format";
import StatusBadge from "@/app/components/StatusBadge";

interface Props {
  lead: LeadWithTeam;
  payments: Payment[];
  onClose: () => void;
  onEstadoChange?: (leadId: string, newEstado: LeadEstado) => void;
}

const SCORE_COLORS: Record<string, string> = {
  A: "bg-green-500/20 text-green-400 border-green-500/30",
  B: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  C: "bg-orange-400/20 text-orange-400 border-orange-400/30",
  D: "bg-red-500/20 text-red-400 border-red-500/30",
};

const QUICK_ESTADOS: LeadEstado[] = [
  "pendiente", "seguimiento", "cerrado", "no_cierre", "no_show", "cancelada",
];

export default function LeadDetailPanel({ lead, payments, onClose, onEstadoChange }: Props) {
  const [changingEstado, setChangingEstado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.notas_internas || "");
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  async function handleEstadoChange(newEstado: LeadEstado) {
    if (!onEstadoChange) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/llamadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          estado: newEstado,
        }),
      });
      if (res.ok) {
        onEstadoChange(lead.id, newEstado);
        setChangingEstado(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setSaving(true);
    try {
      const res = await fetch(`/api/llamadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          notas_internas: notes,
        }),
      });
      if (res.ok) {
        setShowNoteEditor(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const scoreColor = lead.lead_score
    ? SCORE_COLORS[lead.lead_score] || ""
    : "";

  const totalCash = payments
    .filter((p) => p.estado === "pagado")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl z-50 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{lead.nombre || "Sin nombre"}</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <StatusBadge
                  status={lead.estado}
                  label={LEAD_ESTADOS_LABELS[lead.estado] || lead.estado}
                />
                {lead.lead_score && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${scoreColor}`}>
                    {lead.lead_score}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--muted)] hover:text-[var(--foreground)] text-2xl leading-none p-1 shrink-0"
            >
              &times;
            </button>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[var(--muted)] text-xs mb-0.5">Instagram</p>
              <p className="truncate">
                {lead.instagram ? `@${lead.instagram.replace(/^@/, "")}` : "---"}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-xs mb-0.5">Email</p>
              <p className="truncate">{lead.email || "---"}</p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-xs mb-0.5">Telefono</p>
              <p className="truncate">{lead.telefono || "---"}</p>
            </div>
            <div>
              <p className="text-[var(--muted)] text-xs mb-0.5">Closer / Setter</p>
              <p className="truncate">
                {lead.closer?.nombre || "---"} / {lead.setter?.nombre || "---"}
              </p>
            </div>
          </div>

          {/* Lead Details */}
          <div className="bg-[#111113] rounded-lg border border-[var(--card-border)] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)]">Detalle</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Programa" value={lead.programa_pitcheado || undefined} />
              <InfoRow label="Ticket total" value={lead.ticket_total > 0 ? formatUSD(lead.ticket_total) : undefined} />
              <InfoRow label="Plan de pago" value={lead.plan_pago || undefined} />
              <InfoRow label="Fuente" value={lead.fuente || undefined} />
              <InfoRow label="Calificado" value={lead.lead_calificado || undefined} />
              <InfoRow label="Experiencia ecommerce" value={lead.experiencia_ecommerce || undefined} />
              <InfoRow label="Dispuesto a invertir" value={lead.dispuesto_invertir || undefined} />
              <InfoRow label="Decisor" value={lead.decisor || undefined} />
              <InfoRow label="Fecha agendado" value={lead.fecha_agendado ? formatDate(lead.fecha_agendado) : undefined} />
              <InfoRow label="Fecha llamada" value={lead.fecha_llamada ? formatDate(lead.fecha_llamada) : undefined} />
            </div>
          </div>

          {/* Contexto */}
          {lead.contexto_setter && (
            <div className="bg-[#111113] rounded-lg border border-[var(--card-border)] p-4">
              <h3 className="text-sm font-semibold text-[var(--muted)] mb-2">Contexto Setter</h3>
              <p className="text-sm leading-relaxed">{lead.contexto_setter}</p>
            </div>
          )}

          {lead.reporte_general && (
            <div className="bg-[#111113] rounded-lg border border-[var(--card-border)] p-4">
              <h3 className="text-sm font-semibold text-[var(--muted)] mb-2">Reporte General</h3>
              <p className="text-sm leading-relaxed">{lead.reporte_general}</p>
            </div>
          )}

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-[#111113] rounded-lg border border-[var(--card-border)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--muted)]">Pagos</h3>
                <span className="text-sm font-mono text-green-400">
                  {formatUSD(totalCash)} cobrado
                </span>
              </div>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        p.estado === "pagado" ? "bg-green-400" :
                        p.estado === "perdido" ? "bg-red-400" : "bg-yellow-400"
                      }`} />
                      <span>Cuota {p.numero_cuota}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--muted)]">{formatDate(p.fecha_pago)}</span>
                      <span className="font-mono">{formatUSD(p.monto_usd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Estado Change */}
          {!changingEstado ? (
            <button
              onClick={() => setChangingEstado(true)}
              className="w-full text-sm font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] py-2 rounded-lg transition-colors"
            >
              Cambiar estado
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--muted)]">Seleccionar nuevo estado:</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ESTADOS.map((e) => (
                  <button
                    key={e}
                    onClick={() => handleEstadoChange(e)}
                    disabled={saving || e === lead.estado}
                    className={`text-xs py-2 rounded-lg border transition-colors ${
                      e === lead.estado
                        ? "border-[var(--purple)] bg-[var(--purple)]/10 text-[var(--purple)] cursor-default"
                        : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--purple)]/50 hover:text-[var(--foreground)]"
                    } disabled:opacity-50`}
                  >
                    {LEAD_ESTADOS_LABELS[e] || e}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setChangingEstado(false)}
                className="w-full text-xs text-[var(--muted)] hover:text-[var(--foreground)] py-1"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Notes Editor */}
          {!showNoteEditor ? (
            <button
              onClick={() => setShowNoteEditor(true)}
              className="w-full text-sm font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] py-2 rounded-lg transition-colors"
            >
              {lead.notas_internas ? "Editar notas" : "Agregar notas"}
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Notas internas..."
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNoteEditor(false)}
                  className="flex-1 text-xs border border-[var(--card-border)] text-[var(--muted)] py-2 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="flex-1 text-xs bg-[var(--purple)] text-white py-2 rounded-lg disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar notas"}
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 pt-2">
            <a
              href="/form/llamada"
              className="flex-1 text-center text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple)]/80 text-white px-3 py-2 rounded-lg transition-colors"
            >
              Cargar resultado
            </a>
            <a
              href="/form/pago"
              className="flex-1 text-center text-sm font-medium border border-green-500 text-green-400 hover:bg-green-500/10 px-3 py-2 rounded-lg transition-colors"
            >
              Cargar pago
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-[var(--muted)] shrink-0">{label}</span>
      <span className="text-[var(--foreground)] text-right">{value}</span>
    </div>
  );
}
