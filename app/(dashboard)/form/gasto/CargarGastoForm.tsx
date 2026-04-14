"use client";

import { useState } from "react";
import type { AuthSession, TeamMember } from "@/lib/types";

interface Props {
  admins: TeamMember[];
  usdRate: number;
  session: AuthSession;
}

const CATEGORIAS = [
  "Editores",
  "Setters",
  "Closers",
  "Ads",
  "Herramientas",
  "Comisiones",
  "Sueldos",
  "Infraestructura",
  "Impuestos",
  "Otros",
];

const BILLETERAS = ["Binance", "Wise", "Mercado Pago", "Cash", "Transferencia", "Stripe"];

const ESTADOS = ["pagado", "pendiente"];

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const selectClass = inputClass;
const labelClass = "text-sm text-[var(--muted)] block mb-1";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function CargarGastoForm({ admins, usdRate, session }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fecha, setFecha] = useState(todayISO());
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [montoInput, setMontoInput] = useState("");
  const montoUsd = currency === "USD" ? montoInput : montoInput && parseFloat(montoInput) > 0 ? String(Math.round(parseFloat(montoInput) / usdRate)) : "";
  const montoArs = currency === "ARS" ? montoInput : "";
  const [billetera, setBilletera] = useState("");
  const [pagadoA, setPagadoA] = useState("");
  const [pagadoPor, setPagadoPor] = useState(session.nombre || "");
  const [estado, setEstado] = useState("pagado");

  async function handleSubmit() {
    if (!concepto.trim()) { setError("Concepto requerido"); return; }
    const raw = parseFloat(montoInput);
    if (!montoInput || isNaN(raw) || raw <= 0) { setError("Monto inválido"); return; }
    const usd = currency === "USD" ? raw : Math.round(raw / usdRate);

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          concepto: concepto.trim(),
          categoria: categoria || null,
          monto_usd: usd,
          monto_ars: montoArs ? parseFloat(montoArs) : 0,
          billetera: billetera || null,
          pagado_a: pagadoA || null,
          pagado_por: pagadoPor || null,
          estado,
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
    setFecha(todayISO());
    setConcepto("");
    setCategoria("");
    setMontoInput("");
    setCurrency("USD");
    setBilletera("");
    setPagadoA("");
    setPagadoPor(session.nombre || "");
    setEstado("pagado");
    setError("");
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-10 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">Gasto registrado</h3>
        <p className="text-sm text-[var(--muted)]">Se guardó correctamente en finanzas.</p>
        <button onClick={reset} className="mt-2 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
          Cargar otro gasto
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
      <div className="mb-5 pb-4 border-b border-[var(--card-border)]">
        <p className="text-sm font-semibold">Cargar gasto</p>
        <p className="text-xs text-[var(--muted)]">Se registra en la sección de Finanzas</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Concepto *</label>
          <input className={inputClass} value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Pago editores marzo" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Fecha *</label>
            <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Categoría</label>
            <select className={selectClass} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Seleccionar...</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Moneda</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                currency === "USD"
                  ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
              }`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => setCurrency("ARS")}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                currency === "ARS"
                  ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
              }`}
            >
              ARS
            </button>
          </div>
          <label className={labelClass}>Monto {currency} *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
            <input type="number" min={0} step={currency === "USD" ? 10 : 1000} className={`${inputClass} pl-7`} value={montoInput} onChange={(e) => setMontoInput(e.target.value)} placeholder="0" />
          </div>
          {montoInput && parseFloat(montoInput) > 0 && (
            <p className="text-xs text-[var(--muted)] mt-1.5">
              {currency === "ARS" ? (
                <>≈ <span className="text-[var(--purple-light)] font-medium">${Math.round(parseFloat(montoInput) / usdRate).toLocaleString("en-US")} USD</span> (cotización ${usdRate.toLocaleString("es-AR")})</>
              ) : (
                <>≈ <span className="text-[var(--purple-light)] font-medium">${Math.round(parseFloat(montoInput) * usdRate).toLocaleString("es-AR")} ARS</span> (cotización ${usdRate.toLocaleString("es-AR")})</>
              )}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Billetera / Método</label>
          <select className={selectClass} value={billetera} onChange={(e) => setBilletera(e.target.value)}>
            <option value="">Seleccionar...</option>
            {BILLETERAS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Pagado por (quién puso la plata)</label>
            <select className={selectClass} value={pagadoPor} onChange={(e) => setPagadoPor(e.target.value)}>
              <option value="">Seleccionar...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.nombre}>{a.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Pagado a (quién recibe)</label>
            <input className={inputClass} value={pagadoA} onChange={(e) => setPagadoA(e.target.value)} placeholder="Ej: Editor, proveedor..." />
          </div>
        </div>

        <div>
          <label className={labelClass}>Estado</label>
          <select className={selectClass} value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full mt-6 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {loading ? "Guardando..." : "Registrar gasto"}
      </button>
    </div>
  );
}
