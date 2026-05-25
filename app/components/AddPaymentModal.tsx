"use client";

import { useState, useMemo } from "react";

interface LeadOption {
  id: string;
  nombre: string;
}

interface Props {
  leads: LeadOption[];
  defaultLeadId?: string | null;
  onClose: () => void;
  onCreated?: (payment: PaymentResult) => void;
}

export interface PaymentResult {
  id: string;
  lead_id: string | null;
  monto_usd: number;
  fecha_pago: string | null;
  estado: string;
  numero_cuota: number;
  receptor: string | null;
}

const METODOS = ["mercado_pago", "transferencia", "cash", "binance", "stripe", "wise"];

export default function AddPaymentModal({ leads, defaultLeadId, onClose, onCreated }: Props) {
  const [leadId, setLeadId] = useState<string>(defaultLeadId || "");
  const defaultLeadName = defaultLeadId ? (leads.find((l) => l.id === defaultLeadId)?.nombre || "") : "";
  const [search, setSearch] = useState(defaultLeadName);
  const [montoUsd, setMontoUsd] = useState<string>("");
  const [montoArs, setMontoArs] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [numeroCuota, setNumeroCuota] = useState<number>(1);
  const [estado, setEstado] = useState<"pagado" | "pendiente" | "perdido" | "refund">("pagado");
  const [metodoPago, setMetodoPago] = useState<string>("");
  const [metodoCustom, setMetodoCustom] = useState<string>("");
  const [receptor, setReceptor] = useState<string>("");
  const [esRenovacion, setEsRenovacion] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    const sorted = [...leads].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (!search) return sorted.slice(0, 200);
    const s = search.toLowerCase();
    return sorted.filter((l) => l.nombre.toLowerCase().includes(s)).slice(0, 200);
  }, [leads, search]);

  const selectedLead = leads.find((l) => l.id === leadId);

  async function handleSave() {
    if (!leadId) {
      setMsg("Error: seleccioná un lead");
      return;
    }
    if (!montoUsd && !montoArs) {
      setMsg("Error: cargá monto USD o ARS");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const finalMetodo = metodoPago === "otro" ? metodoCustom.trim() : metodoPago;
      const body = {
        lead_id: leadId,
        numero_cuota: numeroCuota,
        monto_usd: Number(montoUsd) || 0,
        monto_ars: Number(montoArs) || 0,
        fecha_pago: fechaPago,
        estado,
        metodo_pago: finalMetodo || undefined,
        receptor: receptor || undefined,
        es_renovacion: esRenovacion,
      };
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok && json.payment) {
        if (onCreated) onCreated(json.payment as PaymentResult);
        onClose();
      } else {
        setMsg(`Error: ${json.error || "no se pudo crear"}`);
      }
    } catch (err) {
      setMsg("Error de red: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white w-full";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--card-border)] flex items-center justify-between sticky top-0 bg-[var(--card-bg)] z-10">
          <div>
            <h2 className="text-lg font-semibold text-white">Cargar pago</h2>
            <p className="text-xs text-[var(--muted)]">Asociar a un lead existente</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--muted)] hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Lead picker */}
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">
              Lead {selectedLead && <span className="text-[var(--green)] ml-1">✓ {selectedLead.nombre}</span>}
            </label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Buscar lead por nombre..." className={`${inputClass} mb-2`} autoFocus />
            <div className="max-h-48 overflow-y-auto border border-[var(--card-border)] rounded bg-[var(--background)]">
              {filteredLeads.length === 0 ? (
                <p className="text-xs text-[var(--muted)] p-3">Sin resultados</p>
              ) : filteredLeads.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLeadId(l.id)}
                  className={`block w-full text-left px-3 py-1.5 text-sm border-b border-[var(--card-border)]/30 last:border-0 ${
                    leadId === l.id ? "bg-[var(--purple)]/30 text-white" : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {l.nombre}
                </button>
              ))}
            </div>
            {leads.length > filteredLeads.length && !search && (
              <p className="text-[10px] text-[var(--muted)] mt-1">
                Mostrando {filteredLeads.length} de {leads.length}. Buscá por nombre para filtrar.
              </p>
            )}
          </div>

          {/* Monto + Cuota + Fecha */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Monto USD</label>
              <input type="number" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)}
                className={inputClass} min={0} step={50} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Monto ARS</label>
              <input type="number" value={montoArs} onChange={(e) => setMontoArs(e.target.value)}
                className={inputClass} min={0} step={1000} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Cuota #</label>
              <input type="number" value={numeroCuota} onChange={(e) => setNumeroCuota(Number(e.target.value))}
                className={inputClass} min={1} max={10} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Fecha pago</label>
              <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)}
                className={inputClass} />
            </div>
          </div>

          {/* Estado + Metodo + Receptor */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className={inputClass}>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
                <option value="perdido">Perdido</option>
                <option value="refund">Refund</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Método de pago</label>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className={inputClass}>
                <option value="">---</option>
                {METODOS.map((m) => (<option key={m} value={m}>{m}</option>))}
                <option value="otro">+ Otro (escribir nuevo)</option>
              </select>
              {metodoPago === "otro" && (
                <input type="text" value={metodoCustom} onChange={(e) => setMetodoCustom(e.target.value)}
                  placeholder="ej: paypal, payoneer..." className={`${inputClass} mt-2`} autoFocus />
              )}
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Receptor</label>
              <input type="text" value={receptor} onChange={(e) => setReceptor(e.target.value)}
                className={inputClass} placeholder="Quién cobró" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={esRenovacion} onChange={(e) => setEsRenovacion(e.target.checked)} />
            Es renovación
          </label>
        </div>

        <div className="p-5 border-t border-[var(--card-border)] flex items-center gap-3 sticky bottom-0 bg-[var(--card-bg)]">
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-5 py-2 rounded-lg disabled:opacity-50">
            {saving ? "Guardando..." : "Cargar pago"}
          </button>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-white px-3 py-2">Cancelar</button>
          {msg && (
            <span className={`text-sm ml-auto ${msg.startsWith("Error") ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
