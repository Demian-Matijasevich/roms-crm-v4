"use client";

import { useState } from "react";

interface Props {
  leadId: string;
  leadNombre: string;
  ticketSugerido?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const PROGRAMAS = [
  { value: "campaña_completa", label: "Campaña Completa" },
  { value: "campaña_reducida", label: "Campaña Reducida" },
  { value: "consultoria", label: "Consultoría" },
  { value: "omnipresencia", label: "Omnipresencia" },
];

const PLANES = [
  { value: "paid_in_full", label: "1 pago (PIF)" },
  { value: "2_cuotas", label: "2 cuotas" },
  { value: "3_cuotas", label: "3 cuotas" },
  { value: "personalizado", label: "Personalizado" },
];

export default function CerrarPoliticaModal({ leadId, leadNombre, ticketSugerido, onClose, onSuccess }: Props) {
  const [ticket, setTicket] = useState<string>(String(ticketSugerido || ""));
  const [programa, setPrograma] = useState("campaña_completa");
  const [plan, setPlan] = useState("paid_in_full");
  const [montoD1, setMontoD1] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().slice(0, 10));
  const [receptor, setReceptor] = useState("");
  const [metodoPago, setMetodoPago] = useState("transferencia");
  const [whatsapp, setWhatsapp] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/cerrar-politica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_total: Number(ticket),
          programa_pitcheado: programa,
          plan_pago: plan,
          monto_d1: montoD1 ? Number(montoD1) : 0,
          fecha_pago_d1: fechaPago,
          metodo_pago: metodoPago,
          receptor: receptor || null,
          notas_handoff: notas || null,
          whatsapp: whatsapp || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    // Solo mover etapa sin cargar info
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/etapa-politica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: "cerrado" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || `HTTP ${res.status}`);
        return;
      }
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0d0d0f] border border-[var(--card-border)] rounded-xl max-w-xl w-full p-6 my-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">🎯 Cerrar deal — {leadNombre}</h2>
            <p className="text-xs text-[var(--muted)] mt-1">Cargá la info que Hugo necesita para arrancar el onboarding.</p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-2xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Programa</label>
              <select className={inputClass} value={programa} onChange={(e) => setPrograma(e.target.value)}>
                {PROGRAMAS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Ticket total (USD)</label>
              <input type="number" className={inputClass} value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="30000" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Plan de pago</label>
            <select className={inputClass} value={plan} onChange={(e) => setPlan(e.target.value)}>
              {PLANES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="border-t border-[var(--card-border)] pt-3 mt-2">
            <p className="text-xs font-semibold text-[var(--muted)] mb-2">💰 Cobro Día 1 (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Monto cobrado (USD)</label>
                <input type="number" className={inputClass} value={montoD1} onChange={(e) => setMontoD1(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Fecha pago</label>
                <input type="date" className={inputClass} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Método</label>
                <select className={inputClass} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option value="transferencia">Transferencia</option>
                  <option value="mercado_pago">Mercado Pago</option>
                  <option value="cash">Cash</option>
                  <option value="binance">Binance / USDT</option>
                  <option value="stripe">Stripe</option>
                  <option value="wise">Wise</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--muted)] block mb-1">Receptor</label>
                <input type="text" className={inputClass} value={receptor} onChange={(e) => setReceptor(e.target.value)} placeholder="Juanma / Mati / etc." />
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--card-border)] pt-3 mt-2">
            <p className="text-xs font-semibold text-[var(--muted)] mb-2">📋 Handoff a Hugo</p>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">WhatsApp del cliente</label>
              <input type="text" className={inputClass} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+54911..." />
            </div>
            <div className="mt-2">
              <label className="text-xs text-[var(--muted)] block mb-1">Notas para Hugo (contexto, qué pitcheaste, qué esperar)</label>
              <textarea
                className={inputClass}
                rows={4}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Cliente cerró por X razón. Quiere arrancar el lunes. Pidió foco en redes y campaña presencial..."
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-[var(--card-border)]">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
            title="Mover a Cerrado sin cargar info ahora"
          >
            Saltear y cargar después
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded-lg border border-[var(--card-border)] hover:bg-[var(--card-bg)]">Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={saving || !ticket}
              className="px-4 py-2 text-sm rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "✅ Cerrar deal + handoff"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
