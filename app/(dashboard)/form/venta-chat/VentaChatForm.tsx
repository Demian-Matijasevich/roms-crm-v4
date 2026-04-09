"use client";

import { useState } from "react";
import type { AuthSession, TeamMember } from "@/lib/types";
import { PROGRAMS, RECEPTORES } from "@/lib/constants";

interface Props {
  session: AuthSession;
  setters: TeamMember[];
}

const METODOS_PAGO = [
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cash", label: "Efectivo" },
  { value: "binance", label: "Binance" },
  { value: "stripe", label: "Stripe" },
  { value: "wise", label: "Wise" },
];

const PLAN_PAGO_OPTIONS = [
  { value: "paid_in_full", label: "PIF" },
  { value: "2_cuotas", label: "2 Cuotas" },
  { value: "3_cuotas", label: "3 Cuotas" },
];

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const selectClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";
const labelClass = "text-sm text-[var(--muted)] block mb-1";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function VentaChatForm({ session, setters }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [nombre, setNombre] = useState("");
  const [instagram, setInstagram] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [setterId, setSetterId] = useState(session.team_member_id);
  const [programa, setPrograma] = useState("");
  const [ticketTotal, setTicketTotal] = useState("");
  const [cashDia1, setCashDia1] = useState("");
  const [planPago, setPlanPago] = useState("paid_in_full");
  const [metodoPago, setMetodoPago] = useState("");
  const [receptor, setReceptor] = useState("");
  const [contexto, setContexto] = useState("");
  const [fecha, setFecha] = useState(todayISO());

  async function handleSubmit() {
    if (!nombre.trim()) { setError("Nombre requerido"); return; }
    if (!programa) { setError("Selecciona un programa"); return; }
    const cash = parseFloat(cashDia1);
    if (!cashDia1 || isNaN(cash) || cash <= 0) { setError("Ingresa un monto valido"); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/venta-directa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          instagram: instagram.trim() || undefined,
          telefono: telefono.trim() || undefined,
          email: email.trim() || undefined,
          programa_pitcheado: programa,
          ticket_total: parseFloat(ticketTotal) || cash,
          plan_pago: planPago,
          monto_usd: cash,
          metodo_pago: metodoPago || undefined,
          receptor: receptor || undefined,
          setter_id: setterId,
          contexto: contexto.trim() || undefined,
          fecha,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar");
      }

      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setNombre(""); setInstagram(""); setTelefono(""); setEmail("");
    setSetterId(session.team_member_id); setPrograma(""); setTicketTotal("");
    setCashDia1(""); setPlanPago("paid_in_full"); setMetodoPago("");
    setReceptor(""); setContexto(""); setFecha(todayISO());
    setError(""); setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-10 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Venta registrada</h3>
        <p className="text-sm text-[var(--muted)]">La venta por chat se guardo en Supabase y aparece en el dashboard.</p>
        <button onClick={reset} className="mt-2 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
          Registrar otra venta
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-[var(--card-border)]">
        <div>
          <p className="text-sm font-semibold">Venta por Chat</p>
          <p className="text-xs text-[var(--muted)]">Se registra como cerrado directo (fuente: dm_directo)</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Lead info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Nombre del lead *</label>
            <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
          </div>
          <div>
            <label className={labelClass}>Instagram</label>
            <input className={inputClass} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Telefono / WhatsApp</label>
            <input className={inputClass} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+54 11..." />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@..." />
          </div>
        </div>

        {/* Setter */}
        <div>
          <label className={labelClass}>Setter</label>
          <select className={selectClass} value={setterId} onChange={(e) => setSetterId(e.target.value)}>
            {setters.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>

        {/* Programa */}
        <div>
          <label className={labelClass}>Programa *</label>
          <select className={selectClass} value={programa} onChange={(e) => setPrograma(e.target.value)}>
            <option value="">Seleccionar programa...</option>
            {Object.entries(PROGRAMS).map(([key, p]) => (
              <option key={key} value={key}>{p.label} - ${p.mensual.toLocaleString()}/mes{p.pif ? ` (PIF $${p.pif.toLocaleString()})` : ""}</option>
            ))}
          </select>
        </div>

        {/* Cash + Ticket */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cash cobrado hoy *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
              <input type="number" className={`${inputClass} pl-7`} value={cashDia1} onChange={(e) => setCashDia1(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Ticket total</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
              <input type="number" className={`${inputClass} pl-7`} value={ticketTotal} onChange={(e) => setTicketTotal(e.target.value)} placeholder="Igual al cash si PIF" />
            </div>
          </div>
        </div>

        {/* Pago details */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Plan de pago</label>
            <select className={selectClass} value={planPago} onChange={(e) => setPlanPago(e.target.value)}>
              {PLAN_PAGO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Metodo</label>
            <select className={selectClass} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              <option value="">Seleccionar...</option>
              {METODOS_PAGO.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Quien recibe</label>
            <select className={selectClass} value={receptor} onChange={(e) => setReceptor(e.target.value)}>
              <option value="">Seleccionar...</option>
              {RECEPTORES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Fecha + Contexto */}
        <div>
          <label className={labelClass}>Fecha del cierre</label>
          <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div>
          <label className={labelClass}>Contexto / notas</label>
          <textarea className={`${inputClass} h-20 resize-none`} value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Como se dio la venta, que se hablo..." />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full mt-6 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {loading ? "Guardando..." : "Registrar venta"}
      </button>
    </div>
  );
}
