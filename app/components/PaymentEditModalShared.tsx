"use client";

import { useState } from "react";

export interface EditablePayment {
  id: string;
  lead_id: string | null;
  numero_cuota: number;
  monto_usd: number;
  monto_ars: number;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  estado: string;
  metodo_pago: string | null;
  receptor: string | null;
  es_renovacion: boolean;
}

interface Props {
  payment: EditablePayment;
  onClose: () => void;
  onSaved?: (updated: Partial<EditablePayment>) => void;
  onDeleted?: (id: string) => void;
}

const METODOS = ["mercado_pago", "transferencia", "cash", "binance", "stripe", "wise"];

export default function PaymentEditModalShared({ payment, onClose, onSaved, onDeleted }: Props) {
  const [montoUsd, setMontoUsd] = useState(String(payment.monto_usd ?? 0));
  const [montoArs, setMontoArs] = useState(String(payment.monto_ars ?? 0));
  const [fechaPago, setFechaPago] = useState(payment.fecha_pago?.split("T")[0] || "");
  const [fechaVencimiento, setFechaVencimiento] = useState(payment.fecha_vencimiento?.split("T")[0] || "");
  const [estado, setEstado] = useState(payment.estado);
  const [numeroCuota, setNumeroCuota] = useState<number>(payment.numero_cuota || 1);
  const [metodoPago, setMetodoPago] = useState(payment.metodo_pago || "");
  const [metodoCustom, setMetodoCustom] = useState("");
  const [esCustom, setEsCustom] = useState(payment.metodo_pago && !METODOS.includes(payment.metodo_pago) ? true : false);
  const [receptor, setReceptor] = useState(payment.receptor || "");
  const [esRenovacion, setEsRenovacion] = useState<boolean>(!!payment.es_renovacion);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const finalMetodo = esCustom ? (metodoCustom.trim() || metodoPago) : metodoPago;
      const body: Record<string, unknown> = {
        id: payment.id,
        monto_usd: parseFloat(montoUsd) || 0,
        monto_ars: parseFloat(montoArs) || 0,
        fecha_pago: fechaPago || null,
        fecha_vencimiento: fechaVencimiento || null,
        estado,
        numero_cuota: numeroCuota,
        metodo_pago: finalMetodo || null,
        receptor: receptor || null,
        es_renovacion: esRenovacion,
      };
      const res = await fetch("/api/pagos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        if (onSaved) onSaved(body as Partial<EditablePayment>);
        onClose();
      } else {
        setMsg("Error: " + (json.error || "no se pudo guardar"));
      }
    } catch (err) {
      setMsg("Error de red: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = window.confirm(`¿Eliminar el pago de cuota #${payment.numero_cuota}?\n\nAcción IRREVERSIBLE.`);
    if (!ok) return;
    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/pagos?id=${encodeURIComponent(payment.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        if (onDeleted) onDeleted(payment.id);
        onClose();
      } else {
        setMsg("Error: " + (json.error || "no se pudo eliminar"));
      }
    } catch (err) {
      setMsg("Error de red: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleting(false);
    }
  }

  const inputClass = "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Editar pago — Cuota #{payment.numero_cuota}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Cuota #</label>
            <input type="number" value={numeroCuota} onChange={(e) => setNumeroCuota(Number(e.target.value))} className={inputClass} min={1} max={20} />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Monto USD</label>
            <input type="number" value={montoUsd} onChange={(e) => setMontoUsd(e.target.value)} className={inputClass} min={0} step={50} />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Monto ARS</label>
            <input type="number" value={montoArs} onChange={(e) => setMontoArs(e.target.value)} className={inputClass} min={0} step={1000} />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Fecha de pago</label>
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Fecha vencimiento</label>
            <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputClass}>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
              <option value="perdido">Perdido</option>
              <option value="refund">Refund</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Método</label>
            <select value={esCustom ? "otro" : metodoPago} onChange={(e) => {
              if (e.target.value === "otro") {
                setEsCustom(true);
              } else {
                setEsCustom(false);
                setMetodoPago(e.target.value);
              }
            }} className={inputClass}>
              <option value="">—</option>
              {METODOS.map((m) => (<option key={m} value={m}>{m}</option>))}
              <option value="otro">+ Otro (escribir)</option>
            </select>
            {esCustom && (
              <input type="text" value={metodoCustom} onChange={(e) => setMetodoCustom(e.target.value)} placeholder="ej: paypal" className={`${inputClass} mt-2`} />
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Receptor</label>
            <input type="text" value={receptor} onChange={(e) => setReceptor(e.target.value)} className={inputClass} placeholder="FRAN, JUANMA..." />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input type="checkbox" checked={esRenovacion} onChange={(e) => setEsRenovacion(e.target.checked)} />
              Es renovación
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-5 items-center">
          <button onClick={handleSave} disabled={saving || deleting}
            className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white py-2 px-5 rounded-lg text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={onClose} className="text-sm text-[var(--muted)] hover:text-white px-3 py-2">Cancelar</button>
          <button onClick={handleDelete} disabled={saving || deleting}
            className="ml-auto text-sm bg-[var(--red)]/10 hover:bg-[var(--red)]/30 border border-[var(--red)]/40 text-[var(--red)] px-4 py-2 rounded-lg disabled:opacity-50">
            {deleting ? "Eliminando..." : "🗑️ Eliminar"}
          </button>
        </div>
        {msg && <p className="text-xs text-[var(--red)] mt-2">{msg}</p>}
      </div>
    </div>
  );
}
