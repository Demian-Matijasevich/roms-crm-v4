"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TrackerSession, SessionTipo, SessionEstado } from "@/lib/types";

interface SessionWithClient extends TrackerSession {
  client?: { id: string; nombre: string; programa: string };
}

interface ActionItem {
  task: string;
  done: boolean;
}

interface Props {
  session: SessionWithClient | null; // null = create new
  onClose: () => void;
}

const TIPOS: { value: SessionTipo; label: string }[] = [
  { value: "estrategia_inicial", label: "Estrategia Inicial" },
  { value: "revision_ajuste", label: "Revision y Ajuste" },
  { value: "cierre_ciclo", label: "Cierre de Ciclo" },
  { value: "adicional", label: "Adicional" },
];

const ESTADOS: { value: SessionEstado; label: string }[] = [
  { value: "programada", label: "Programada" },
  { value: "done", label: "Completada" },
  { value: "cancelada_no_asistio", label: "Cancelada / No asistio" },
];

export default function SessionFormModal({ session, onClose }: Props) {
  const router = useRouter();
  const isEdit = session !== null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Search clients for new session
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(session?.client_id ?? "");
  const [selectedClientName, setSelectedClientName] = useState(session?.client?.nombre ?? "");

  // Form fields
  const [fecha, setFecha] = useState(session?.fecha ?? new Date().toISOString().split("T")[0]);
  const [numeroSesion, setNumeroSesion] = useState(session?.numero_sesion ?? 1);
  const [tipoSesion, setTipoSesion] = useState<SessionTipo>(session?.tipo_sesion ?? "estrategia_inicial");
  const [estado, setEstado] = useState<SessionEstado>(session?.estado ?? "programada");
  const [notasSetup, setNotasSetup] = useState(session?.notas_setup ?? "");
  const [pitchUpsell, setPitchUpsell] = useState(session?.pitch_upsell ?? false);
  const [rating, setRating] = useState(session?.rating?.toString() ?? "");
  const [aprendizaje, setAprendizaje] = useState(session?.aprendizaje_principal ?? "");
  const [feedback, setFeedback] = useState(session?.feedback_cliente ?? "");
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    Array.isArray(session?.action_items)
      ? (session!.action_items as unknown as ActionItem[])
      : []
  );
  const [followUpDate, setFollowUpDate] = useState(session?.follow_up_date ?? "");

  // Client search with debounce
  useEffect(() => {
    if (!clientSearch || clientSearch.length < 2 || isEdit) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(clientSearch)}`);
      if (res.ok) {
        const data = await res.json();
        setClientResults(data.clients ?? []);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch, isEdit]);

  function addActionItem() {
    setActionItems([...actionItems, { task: "", done: false }]);
  }

  function updateActionItem(index: number, field: keyof ActionItem, value: string | boolean) {
    const updated = [...actionItems];
    updated[index] = { ...updated[index], [field]: value };
    setActionItems(updated);
  }

  function removeActionItem(index: number) {
    setActionItems(actionItems.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId && !isEdit) { setError("Selecciona un cliente"); return; }
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      client_id: selectedClientId || session?.client_id,
      fecha,
      numero_sesion: numeroSesion,
      tipo_sesion: tipoSesion,
      estado,
      notas_setup: notasSetup || undefined,
      pitch_upsell: pitchUpsell,
      rating: rating ? parseInt(rating) : undefined,
      aprendizaje_principal: aprendizaje || undefined,
      feedback_cliente: feedback || undefined,
      action_items: actionItems.filter((ai) => ai.task.trim()),
      follow_up_date: followUpDate || undefined,
    };

    if (isEdit) body.id = session!.id;

    const res = await fetch("/api/tracker", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar");
    }
    setSaving(false);
  }

  const inputCls = "w-full px-3 py-2 rounded-lg bg-black/20 border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none";
  const labelCls = "block text-xs text-[var(--muted)] mb-1";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? `Editar Sesion #${session!.numero_sesion}` : "Nueva Sesion 1a1"}
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client selector (only for new) */}
          {!isEdit ? (
            <div>
              <label className={labelCls}>Cliente *</label>
              {selectedClientId ? (
                <div className="flex items-center gap-2">
                  <span className="text-white">{selectedClientName}</span>
                  <button type="button" onClick={() => { setSelectedClientId(""); setSelectedClientName(""); setClientSearch(""); }} className="text-[var(--muted)] hover:text-[var(--red)] text-xs">&times; Cambiar</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    className={inputCls}
                  />
                  {clientResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg z-10 max-h-40 overflow-y-auto">
                      {clientResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedClientId(c.id); setSelectedClientName(c.nombre); setClientResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5"
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Cliente: <span className="text-white">{session!.client?.nombre ?? session!.client_id}</span></p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Fecha *</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Sesion #</label>
              <input type="number" value={numeroSesion} onChange={(e) => setNumeroSesion(parseInt(e.target.value) || 1)} className={inputCls} min="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tipo de Sesion</label>
              <select value={tipoSesion} onChange={(e) => setTipoSesion(e.target.value as SessionTipo)} className={inputCls}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value as SessionEstado)} className={inputCls}>
                {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notas de Setup</label>
            <textarea value={notasSetup} onChange={(e) => setNotasSetup(e.target.value)} className={inputCls + " resize-none"} rows={2} placeholder="Contexto antes de la sesion..." />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Rating (1-10)</label>
              <input type="number" value={rating} onChange={(e) => setRating(e.target.value)} className={inputCls} min="1" max="10" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-white cursor-pointer pb-2">
                <input type="checkbox" checked={pitchUpsell} onChange={(e) => setPitchUpsell(e.target.checked)} className="accent-[var(--purple)]" />
                Pitch Upsell
              </label>
            </div>
            <div>
              <label className={labelCls}>Follow-up</label>
              <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Aprendizaje Principal</label>
            <textarea value={aprendizaje} onChange={(e) => setAprendizaje(e.target.value)} className={inputCls + " resize-none"} rows={2} />
          </div>

          <div>
            <label className={labelCls}>Feedback del Cliente</label>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className={inputCls + " resize-none"} rows={2} />
          </div>

          {/* Action items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Action Items</label>
              <button type="button" onClick={addActionItem} className="text-xs text-[var(--purple-light)] hover:text-white">+ Agregar</button>
            </div>
            <div className="space-y-2">
              {actionItems.map((ai, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ai.done}
                    onChange={(e) => updateActionItem(i, "done", e.target.checked)}
                    className="accent-[var(--purple)]"
                  />
                  <input
                    type="text"
                    value={ai.task}
                    onChange={(e) => updateActionItem(i, "task", e.target.value)}
                    placeholder="Tarea..."
                    className={inputCls}
                  />
                  <button type="button" onClick={() => removeActionItem(i)} className="text-[var(--red)] hover:text-white text-sm">&times;</button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-[var(--red)] text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--muted)] hover:text-white">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm disabled:opacity-50 hover:bg-[var(--purple-dark)]"
            >
              {saving ? "Guardando..." : isEdit ? "Actualizar" : "Crear Sesion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
