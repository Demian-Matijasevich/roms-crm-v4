"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { LeadWithTeam } from "@/lib/queries/leads";
import type { Payment, LeadEstado } from "@/lib/types";
import { LEAD_ESTADOS_LABELS } from "@/lib/constants";
import { formatUSD, formatDate, formatMoney } from "@/lib/format";
import StatusBadge from "@/app/components/StatusBadge";

interface Props {
  lead: LeadWithTeam;
  payments: Payment[];
  usdRate?: number;
  isPolitica?: boolean;
  onClose: () => void;
  onEstadoChange?: (leadId: string, newEstado: LeadEstado) => void;
  // Llamado cuando cambia algo que afecta a la tarjeta del board (labels, checklist, etc).
  onCardDataChange?: (leadId: string) => void;
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

type Tab = "detalle" | "comentarios" | "checklist" | "labels" | "adjuntos" | "actividad";

type Comment = {
  id: string;
  author_id: string | null;
  author_nombre: string | null;
  body: string;
  created_at: string;
};

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  position: number;
  created_at: string;
  completed_at: string | null;
};

type LabelObj = { id: string; nombre: string; color: string; scope: string };

type Attachment = {
  id: string;
  nombre: string;
  url: string;
  tipo: string | null;
  size_bytes: number | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  actor_nombre: string | null;
  tipo: string;
  mensaje: string | null;
  created_at: string;
};

const ICON_BY_TIPO: Record<string, string> = {
  comment: "💬",
  etapa_change: "🔀",
  label_add: "🏷️",
  label_remove: "🚫",
  checklist_item_add: "☑️",
  checklist_item_done: "✅",
  attachment_add: "📎",
  assignment: "👤",
  other: "•",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace segundos";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(iso));
}

export default function LeadDetailPanel({
  lead,
  payments,
  usdRate = 1250,
  isPolitica = false,
  onClose,
  onEstadoChange,
  onCardDataChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("detalle");
  const [changingEstado, setChangingEstado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.notas_internas || "");
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Data por tab
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");

  const [leadLabels, setLeadLabels] = useState<LabelObj[]>([]);
  const [allLabels, setAllLabels] = useState<LabelObj[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attsLoading, setAttsLoading] = useState(false);
  const [attForm, setAttForm] = useState({ nombre: "", url: "", tipo: "link" });

  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const notifyCardChange = useCallback(() => {
    onCardDataChange?.(lead.id);
  }, [lead.id, onCardDataChange]);

  // Loaders
  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/comments`);
      const json = await res.json();
      if (res.ok) setComments(json.comments || []);
    } finally {
      setCommentsLoading(false);
    }
  }, [lead.id]);

  const loadChecklist = useCallback(async () => {
    setChecklistLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/checklist`);
      const json = await res.json();
      if (res.ok) setChecklist(json.items || []);
    } finally {
      setChecklistLoading(false);
    }
  }, [lead.id]);

  const loadLabels = useCallback(async () => {
    setLabelsLoading(true);
    try {
      const scope = isPolitica ? "politica" : "general";
      const [leadRes, allRes] = await Promise.all([
        fetch(`/api/leads/${lead.id}/labels`),
        fetch(`/api/labels?scope=${scope}`),
      ]);
      const leadJson = await leadRes.json();
      const allJson = await allRes.json();
      if (leadRes.ok) setLeadLabels(leadJson.labels || []);
      if (allRes.ok) setAllLabels(allJson.labels || []);
    } finally {
      setLabelsLoading(false);
    }
  }, [lead.id, isPolitica]);

  const loadAttachments = useCallback(async () => {
    setAttsLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/attachments`);
      const json = await res.json();
      if (res.ok) setAttachments(json.attachments || []);
    } finally {
      setAttsLoading(false);
    }
  }, [lead.id]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/activity`);
      const json = await res.json();
      if (res.ok) setActivity(json.activity || []);
    } finally {
      setActivityLoading(false);
    }
  }, [lead.id]);

  // Auto-load por tab
  useEffect(() => {
    if (tab === "comentarios") loadComments();
    else if (tab === "checklist") loadChecklist();
    else if (tab === "labels") loadLabels();
    else if (tab === "adjuntos") loadAttachments();
    else if (tab === "actividad") loadActivity();
  }, [tab, loadComments, loadChecklist, loadLabels, loadAttachments, loadActivity]);

  // Precargar checklist al abrir el panel para mostrar el % en el tab title.
  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  async function handleEstadoChange(newEstado: LeadEstado) {
    if (!onEstadoChange) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/llamadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, estado: newEstado }),
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
        body: JSON.stringify({ lead_id: lead.id, notas_internas: notes }),
      });
      if (res.ok) setShowNoteEditor(false);
    } finally {
      setSaving(false);
    }
  }

  // Comentarios
  async function submitComment() {
    const text = newComment.trim();
    if (!text) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json();
      if (res.ok && json.comment) {
        setComments((prev) => [...prev, json.comment]);
        setNewComment("");
        notifyCardChange();
      }
    } finally {
      setSaving(false);
    }
  }

  // Checklist
  async function addChecklistItem() {
    const text = newItemLabel.trim();
    if (!text) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: text }),
      });
      const json = await res.json();
      if (res.ok && json.item) {
        setChecklist((prev) => [...prev, json.item]);
        setNewItemLabel("");
        notifyCardChange();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleItemDone(item: ChecklistItem) {
    const next = !item.done;
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: next } : i)));
    try {
      await fetch(`/api/leads/${lead.id}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, done: next }),
      });
      notifyCardChange();
    } catch {
      // revertir
      setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !next } : i)));
    }
  }

  async function deleteItem(itemId: string) {
    setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await fetch(`/api/leads/${lead.id}/checklist/${itemId}`, { method: "DELETE" });
      notifyCardChange();
    } catch {
      // no-op
    }
  }

  // Labels
  async function addLabel(labelId: string) {
    const found = allLabels.find((l) => l.id === labelId);
    if (!found) return;
    if (leadLabels.some((l) => l.id === labelId)) return;
    setLeadLabels((prev) => [...prev, found]);
    setShowLabelPicker(false);
    try {
      await fetch(`/api/leads/${lead.id}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label_id: labelId }),
      });
      notifyCardChange();
    } catch {
      setLeadLabels((prev) => prev.filter((l) => l.id !== labelId));
    }
  }

  async function removeLabel(labelId: string) {
    const prevList = leadLabels;
    setLeadLabels((prev) => prev.filter((l) => l.id !== labelId));
    try {
      await fetch(`/api/leads/${lead.id}/labels?label_id=${labelId}`, { method: "DELETE" });
      notifyCardChange();
    } catch {
      setLeadLabels(prevList);
    }
  }

  // Attachments
  async function submitAttachment() {
    const nombre = attForm.nombre.trim();
    const url = attForm.url.trim();
    if (!nombre || !url) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, url, tipo: attForm.tipo }),
      });
      const json = await res.json();
      if (res.ok && json.attachment) {
        setAttachments((prev) => [json.attachment, ...prev]);
        setAttForm({ nombre: "", url: "", tipo: "link" });
        notifyCardChange();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteAttachment(attId: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
    try {
      await fetch(`/api/leads/${lead.id}/attachments?id=${attId}`, { method: "DELETE" });
      notifyCardChange();
    } catch {
      // no-op
    }
  }

  const scoreColor = lead.lead_score ? SCORE_COLORS[lead.lead_score] || "" : "";

  const totalCash = payments
    .filter((p) => p.estado === "pagado")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  const checklistPct = useMemo(() => {
    if (checklist.length === 0) return null;
    const done = checklist.filter((i) => i.done).length;
    return Math.round((done / checklist.length) * 100);
  }, [checklist]);

  const availableLabels = allLabels.filter((l) => !leadLabels.some((x) => x.id === l.id));

  const TABS: { key: Tab; label: string; badge?: string | number | null }[] = [
    { key: "detalle", label: "Detalle" },
    { key: "comentarios", label: "Comentarios" },
    { key: "checklist", label: "Checklist", badge: checklistPct !== null ? `${checklistPct}%` : null },
    { key: "labels", label: "Labels" },
    { key: "adjuntos", label: "Adjuntos" },
    { key: "actividad", label: "Actividad" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl z-50 overflow-y-auto">
        <div className="p-5 space-y-4">
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

          {/* Tabs */}
          <div className="flex gap-1 border-b border-[var(--card-border)] overflow-x-auto -mx-1 px-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-xs font-medium px-2.5 py-2 border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? "border-[var(--purple)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t.label}
                {t.badge != null && (
                  <span className="ml-1 text-[10px] text-[var(--muted)]">{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ===== Tab: Detalle ===== */}
          {tab === "detalle" && (
            <div className="space-y-5">
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
                          <span
                            className={`w-2 h-2 rounded-full ${
                              p.estado === "pagado"
                                ? "bg-green-400"
                                : p.estado === "perdido"
                                ? "bg-red-400"
                                : "bg-yellow-400"
                            }`}
                          />
                          <span>Cuota {p.numero_cuota}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[var(--muted)]">{formatDate(p.fecha_pago)}</span>
                          <span className="font-mono">{formatMoney(p.monto_usd, p.monto_ars, usdRate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cambiar estado */}
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

              {/* Notas */}
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
          )}

          {/* ===== Tab: Comentarios ===== */}
          {tab === "comentarios" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  placeholder="Escribí un comentario..."
                  className="flex-1 bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]"
                />
                <button
                  onClick={submitComment}
                  disabled={saving || !newComment.trim()}
                  className="text-xs bg-[var(--purple)] text-white px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
              {commentsLoading ? (
                <p className="text-xs text-[var(--muted)]">Cargando...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-[var(--muted)] text-center py-6">Sin comentarios todavía</p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-[#111113] border border-[var(--card-border)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">{c.author_nombre || "Anónimo"}</span>
                        <span className="text-[10px] text-[var(--muted)]">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== Tab: Checklist ===== */}
          {tab === "checklist" && (
            <div className="space-y-3">
              {checklistPct !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>Progreso</span>
                    <span>
                      {checklist.filter((i) => i.done).length} / {checklist.length} ({checklistPct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--card-border)] rounded">
                    <div
                      className="h-1.5 bg-[var(--purple)] rounded transition-all"
                      style={{ width: `${checklistPct}%` }}
                    />
                  </div>
                </div>
              )}

              {checklistLoading ? (
                <p className="text-xs text-[var(--muted)]">Cargando...</p>
              ) : (
                <div className="space-y-1.5">
                  {checklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 bg-[#111113] border border-[var(--card-border)] rounded-lg px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleItemDone(item)}
                        className="accent-[var(--purple)]"
                      />
                      <span className={`flex-1 text-sm ${item.done ? "line-through text-[var(--muted)]" : ""}`}>
                        {item.label}
                      </span>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-[var(--muted)] hover:text-red-400 text-sm"
                        title="Eliminar"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                  placeholder="+ Agregar item..."
                  className="flex-1 bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]"
                />
                <button
                  onClick={addChecklistItem}
                  disabled={saving || !newItemLabel.trim()}
                  className="text-xs bg-[var(--purple)] text-white px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}

          {/* ===== Tab: Labels ===== */}
          {tab === "labels" && (
            <div className="space-y-3">
              {labelsLoading ? (
                <p className="text-xs text-[var(--muted)]">Cargando...</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {leadLabels.length === 0 && (
                      <p className="text-xs text-[var(--muted)]">Sin labels asignados</p>
                    )}
                    {leadLabels.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => removeLabel(l.id)}
                        className="text-[11px] px-2 py-1 rounded border inline-flex items-center gap-1 hover:opacity-80"
                        style={{
                          backgroundColor: `${l.color}22`,
                          borderColor: `${l.color}55`,
                          color: l.color,
                        }}
                        title="Click para quitar"
                      >
                        <span>{l.nombre}</span>
                        <span className="opacity-60">&times;</span>
                      </button>
                    ))}
                  </div>

                  {!showLabelPicker ? (
                    <button
                      onClick={() => setShowLabelPicker(true)}
                      className="w-full text-xs border border-dashed border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] py-2 rounded-lg"
                    >
                      + Agregar label
                    </button>
                  ) : (
                    <div className="bg-[#111113] border border-[var(--card-border)] rounded-lg p-2 max-h-64 overflow-y-auto space-y-1">
                      {availableLabels.length === 0 && (
                        <p className="text-xs text-[var(--muted)] text-center py-2">
                          No quedan labels disponibles
                        </p>
                      )}
                      {availableLabels.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => addLabel(l.id)}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--card-bg)] flex items-center gap-2"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: l.color }}
                          />
                          <span>{l.nombre}</span>
                          <span className="ml-auto text-[10px] text-[var(--muted)]">{l.scope}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => setShowLabelPicker(false)}
                        className="w-full text-xs text-[var(--muted)] py-1 mt-1"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ===== Tab: Adjuntos ===== */}
          {tab === "adjuntos" && (
            <div className="space-y-3">
              {attsLoading ? (
                <p className="text-xs text-[var(--muted)]">Cargando...</p>
              ) : attachments.length === 0 ? (
                <p className="text-xs text-[var(--muted)] text-center py-4">Sin adjuntos</p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 bg-[#111113] border border-[var(--card-border)] rounded-lg px-3 py-2"
                    >
                      <span className="text-base">{iconForTipo(a.tipo)}</span>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 text-sm text-[var(--foreground)] hover:text-[var(--purple)] truncate"
                      >
                        {a.nombre}
                      </a>
                      <button
                        onClick={() => deleteAttachment(a.id)}
                        className="text-[var(--muted)] hover:text-red-400 text-sm"
                        title="Eliminar"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#111113] border border-[var(--card-border)] rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-[var(--muted)]">Nuevo adjunto</p>
                <input
                  value={attForm.nombre}
                  onChange={(e) => setAttForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre"
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--purple)]"
                />
                <input
                  value={attForm.url}
                  onChange={(e) => setAttForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="URL (Drive, link externo...)"
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--purple)]"
                />
                <div className="flex gap-2">
                  <select
                    value={attForm.tipo}
                    onChange={(e) => setAttForm((f) => ({ ...f, tipo: e.target.value }))}
                    className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--purple)]"
                  >
                    <option value="link">Link</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Imagen</option>
                    <option value="doc">Documento</option>
                    <option value="other">Otro</option>
                  </select>
                  <button
                    onClick={submitAttachment}
                    disabled={saving || !attForm.nombre.trim() || !attForm.url.trim()}
                    className="flex-1 text-xs bg-[var(--purple)] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Adjuntar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== Tab: Actividad ===== */}
          {tab === "actividad" && (
            <div className="space-y-2">
              {activityLoading ? (
                <p className="text-xs text-[var(--muted)]">Cargando...</p>
              ) : activity.length === 0 ? (
                <p className="text-xs text-[var(--muted)] text-center py-4">Sin actividad registrada</p>
              ) : (
                activity.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 bg-[#111113] border border-[var(--card-border)] rounded-lg px-3 py-2"
                  >
                    <span className="text-base leading-tight">{ICON_BY_TIPO[a.tipo] || "•"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        <span className="font-semibold">{a.actor_nombre || "Sistema"}</span>{" "}
                        <span className="text-[var(--muted)]">{a.mensaje || a.tipo}</span>
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function iconForTipo(tipo: string | null): string {
  switch (tipo) {
    case "pdf":
      return "📄";
    case "image":
      return "🖼️";
    case "doc":
      return "📝";
    case "link":
      return "🔗";
    default:
      return "📎";
  }
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
