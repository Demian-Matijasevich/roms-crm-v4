"use client";

import { useState, useEffect } from "react";
import { PROGRAMS, LEAD_ESTADOS_LABELS } from "@/lib/constants";

export interface EditableLead {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: string;
  lead_calificado: string | null;
  programa_pitcheado: string | null;
  ticket_total: number;
  closer_id: string | null;
  setter_id: string | null;
  plan_pago: string | null;
  concepto: string | null;
  fuente: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  notas_internas: string | null;
  reporte_general: string | null;
}

export interface TeamMemberLite { id: string; nombre: string; is_closer?: boolean; is_setter?: boolean }

interface Props {
  lead: EditableLead;
  closers: TeamMemberLite[];
  setters: TeamMemberLite[];
  onClose: () => void;
  onSaved?: (updated: Partial<EditableLead>) => void;
}

const NULLABLE = new Set([
  "email", "telefono", "instagram", "fecha_agendado", "fecha_llamada",
  "closer_id", "setter_id", "fuente", "plan_pago", "concepto",
  "utm_source", "utm_medium", "utm_content",
  "programa_pitcheado", "lead_calificado",
  "notas_internas", "reporte_general",
]);

export default function LeadEditModal({ lead, closers, setters, onClose, onSaved }: Props) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setData({
      nombre: lead.nombre || "",
      email: lead.email || "",
      telefono: lead.telefono || "",
      instagram: lead.instagram || "",
      fecha_agendado: lead.fecha_agendado ? lead.fecha_agendado.split("T")[0] : "",
      fecha_llamada: lead.fecha_llamada ? lead.fecha_llamada.split("T")[0] : "",
      estado: lead.estado,
      lead_calificado: lead.lead_calificado || "",
      programa_pitcheado: lead.programa_pitcheado || "",
      ticket_total: lead.ticket_total,
      closer_id: lead.closer_id || "",
      setter_id: lead.setter_id || "",
      plan_pago: lead.plan_pago || "",
      concepto: lead.concepto || "",
      fuente: lead.fuente || "",
      utm_source: lead.utm_source || "",
      utm_medium: lead.utm_medium || "",
      utm_content: lead.utm_content || "",
      notas_internas: lead.notas_internas || "",
      reporte_general: lead.reporte_general || "",
    });
  }, [lead]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { id: lead.id };
      for (const [k, v] of Object.entries(data)) {
        if (v === "" && NULLABLE.has(k)) payload[k] = null;
        else if (k === "ticket_total") payload[k] = v === "" || v === null ? 0 : Number(v);
        else payload[k] = v;
      }
      const res = await fetch("/api/llamadas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        if (json.warning) {
          setMsg(`⚠️ ${json.warning}`);
          if (onSaved) onSaved(payload as Partial<EditableLead>);
          // No autocerrar — que vea el aviso
        } else {
          setMsg("Guardado");
          if (onSaved) onSaved(payload as Partial<EditableLead>);
          setTimeout(() => onClose(), 600);
        }
      } else {
        setMsg(`Error: ${json.error || "desconocido"}`);
      }
    } catch (err) {
      setMsg("Error de red: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white w-full";
  const selectClass = inputClass;

  const estadoOptions = Object.entries(LEAD_ESTADOS_LABELS) as Array<[string, string]>;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl w-full max-w-5xl my-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--card-border)] flex items-center justify-between sticky top-0 bg-[var(--card-bg)] z-10">
          <div>
            <h2 className="text-lg font-semibold text-white">Editar lead</h2>
            <p className="text-xs text-[var(--muted)]">{lead.nombre}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--muted)] hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Contacto */}
          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Contacto</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Nombre"><input type="text" value={(data.nombre as string) ?? ""} onChange={(e) => setData({ ...data, nombre: e.target.value })} className={inputClass} /></Field>
            <Field label="Email"><input type="email" value={(data.email as string) ?? ""} onChange={(e) => setData({ ...data, email: e.target.value })} className={inputClass} /></Field>
            <Field label="Telefono"><input type="tel" value={(data.telefono as string) ?? ""} onChange={(e) => setData({ ...data, telefono: e.target.value })} className={inputClass} /></Field>
            <Field label="Instagram"><input type="text" value={(data.instagram as string) ?? ""} onChange={(e) => setData({ ...data, instagram: e.target.value })} className={inputClass} placeholder="@usuario" /></Field>
          </div>

          {/* Calificación */}
          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Calificación</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Estado">
              <select value={(data.estado as string) || lead.estado} onChange={(e) => setData({ ...data, estado: e.target.value })} className={selectClass}>
                {estadoOptions.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
            </Field>
            <Field label="Programa pitcheado">
              <select value={(data.programa_pitcheado as string) ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__otro__") {
                    const custom = window.prompt("Nuevo programa (slug, ej: ecommerce_pro):");
                    if (custom && custom.trim()) setData({ ...data, programa_pitcheado: custom.trim() });
                  } else {
                    setData({ ...data, programa_pitcheado: v });
                  }
                }}
                className={selectClass}>
                <option value="">Sin programa</option>
                {Object.entries(PROGRAMS).map(([k, p]) => (<option key={k} value={k}>{p.label}</option>))}
                {typeof data.programa_pitcheado === "string" && data.programa_pitcheado && !PROGRAMS[data.programa_pitcheado] && (
                  <option value={data.programa_pitcheado}>{data.programa_pitcheado}</option>
                )}
                <option value="__otro__">+ Otro (escribir nuevo)</option>
              </select>
            </Field>
            <Field label="Lead calificado">
              <select value={(data.lead_calificado as string) ?? ""} onChange={(e) => setData({ ...data, lead_calificado: e.target.value })} className={selectClass}>
                <option value="">---</option>
                <option value="calificado">Calificado</option>
                <option value="no_calificado">No calificado</option>
                <option value="podria">Podria</option>
              </select>
            </Field>
            <Field label="Ticket total (USD)">
              <input type="number" value={(data.ticket_total as number) ?? 0} onChange={(e) => setData({ ...data, ticket_total: Number(e.target.value) })} className={inputClass} min={0} step={100} />
            </Field>
          </div>

          {/* Asignaciones + Fechas */}
          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Asignaciones / Fechas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Closer">
              <select value={(data.closer_id as string) ?? ""} onChange={(e) => setData({ ...data, closer_id: e.target.value })} className={selectClass}>
                <option value="">Sin closer</option>
                {closers.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
            </Field>
            <Field label="Setter">
              <select value={(data.setter_id as string) ?? ""} onChange={(e) => setData({ ...data, setter_id: e.target.value })} className={selectClass}>
                <option value="">Sin setter</option>
                {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
              </select>
            </Field>
            <Field label="Fecha agendado">
              <input type="date" value={(data.fecha_agendado as string) ?? ""} onChange={(e) => setData({ ...data, fecha_agendado: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Fecha llamada">
              <input type="date" value={(data.fecha_llamada as string) ?? ""} onChange={(e) => setData({ ...data, fecha_llamada: e.target.value })} className={inputClass} />
            </Field>
          </div>

          {/* Plan + Concepto + Fuente + UTMs */}
          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Pago / Tracking</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Plan pago">
              <select value={(data.plan_pago as string) ?? ""} onChange={(e) => setData({ ...data, plan_pago: e.target.value })} className={selectClass}>
                <option value="">---</option>
                <option value="paid_in_full">Cash (full)</option>
                <option value="2_cuotas">2 cuotas</option>
                <option value="3_cuotas">3 cuotas</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </Field>
            <Field label="Concepto">
              <select value={(data.concepto as string) ?? ""} onChange={(e) => setData({ ...data, concepto: e.target.value })} className={selectClass}>
                <option value="">---</option>
                <option value="reserva">Reserva</option>
                <option value="pago_total">Pago total</option>
                <option value="cuota_1">Cuota 1</option>
                <option value="cuota_2">Cuota 2</option>
              </select>
            </Field>
            <Field label="Fuente">
              <input type="text" value={(data.fuente as string) ?? ""} onChange={(e) => setData({ ...data, fuente: e.target.value })} className={inputClass} />
            </Field>
            <Field label="UTM source">
              <input type="text" value={(data.utm_source as string) ?? ""} onChange={(e) => setData({ ...data, utm_source: e.target.value })} className={inputClass} />
            </Field>
            <Field label="UTM medium">
              <input type="text" value={(data.utm_medium as string) ?? ""} onChange={(e) => setData({ ...data, utm_medium: e.target.value })} className={inputClass} />
            </Field>
            <Field label="UTM content">
              <input type="text" value={(data.utm_content as string) ?? ""} onChange={(e) => setData({ ...data, utm_content: e.target.value })} className={inputClass} />
            </Field>
          </div>

          {/* Notas */}
          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Notas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Notas internas">
              <textarea value={(data.notas_internas as string) ?? ""} onChange={(e) => setData({ ...data, notas_internas: e.target.value })} className={`${inputClass} min-h-[80px] resize-y`} rows={3} />
            </Field>
            <Field label="Reporte general">
              <textarea value={(data.reporte_general as string) ?? ""} onChange={(e) => setData({ ...data, reporte_general: e.target.value })} className={`${inputClass} min-h-[80px] resize-y`} rows={3} />
            </Field>
          </div>
        </div>

        <div className="p-5 border-t border-[var(--card-border)] flex items-center gap-3 sticky bottom-0 bg-[var(--card-bg)]">
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-5 py-2 rounded-lg disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={onClose}
            className="text-sm text-[var(--muted)] hover:text-white px-3 py-2">
            Cancelar
          </button>
          {msg && (
            <span className={`text-sm ${msg.startsWith("Error") ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[var(--muted)] mb-1 block">{label}</label>
      {children}
    </div>
  );
}
