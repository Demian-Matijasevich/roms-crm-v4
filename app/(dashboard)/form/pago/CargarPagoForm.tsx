"use client";

import { useState, useMemo, useRef } from "react";
import type { AuthSession, TeamMember, Payment } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { PROGRAMS, RECEPTORES } from "@/lib/constants";
import { formatUSD } from "@/lib/format";

interface Props {
  leads: LeadWithTeam[];
  paymentsByLead: Record<string, Payment[]>;
  team: TeamMember[];
  session: AuthSession;
}

type Step = 1 | 2;

const METODOS_PAGO = [
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cash", label: "Efectivo" },
  { value: "binance", label: "Binance" },
  { value: "stripe", label: "Stripe" },
  { value: "wise", label: "Wise" },
];

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const labelClass = "text-sm text-[var(--muted)] block mb-1";
const selectClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function getPaymentSummary(payments: Payment[]): { pagadas: number; pendientes: number; totalPagado: number } {
  let pagadas = 0;
  let pendientes = 0;
  let totalPagado = 0;
  for (const p of payments) {
    if (p.estado === "pagado") {
      pagadas++;
      totalPagado += p.monto_usd;
    } else if (p.estado === "pendiente") {
      pendientes++;
    }
  }
  return { pagadas, pendientes, totalPagado };
}

export default function CargarPagoForm({ leads, paymentsByLead, team, session }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LeadWithTeam | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [numeroCuota, setNumeroCuota] = useState<number>(2);
  const [montoUsd, setMontoUsd] = useState("");
  const [montoArs, setMontoArs] = useState("");
  const [fechaPago, setFechaPago] = useState(todayISO());
  const [metodoPago, setMetodoPago] = useState("");
  const [receptor, setReceptor] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);

  // Suppress unused variable warnings
  void team;
  void session;

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.nombre?.toLowerCase().includes(q) ||
        l.instagram?.toLowerCase().includes(q) ||
        l.closer?.nombre?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  function selectLead(lead: LeadWithTeam) {
    setSelected(lead);
    const existingPayments = paymentsByLead[lead.id] || [];
    setNumeroCuota(existingPayments.length + 1);
    setStep(2);
  }

  function volver() {
    setSelected(null);
    setStep(1);
    setError("");
  }

  async function handleSubmit() {
    if (!selected) return;
    const monto = parseFloat(montoUsd);
    if (!montoUsd || isNaN(monto) || monto <= 0) {
      setError("Ingresa un monto valido mayor a 0.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      // Upload comprobante if present
      let comprobanteUrl: string | undefined;
      if (comprobante) {
        const formData = new FormData();
        formData.append("file", comprobante);
        formData.append("lead_id", selected.id);

        const uploadRes = await fetch("/api/pagos?upload=1", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          comprobanteUrl = uploadData.url;
        }
      }

      const body = {
        lead_id: selected.id,
        numero_cuota: numeroCuota,
        monto_usd: monto,
        monto_ars: montoArs ? parseFloat(montoArs) : 0,
        fecha_pago: fechaPago,
        estado: "pagado",
        metodo_pago: metodoPago || undefined,
        receptor: receptor || undefined,
        comprobante_url: comprobanteUrl,
        es_renovacion: false,
      };

      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    setStep(1);
    setSearch("");
    setSelected(null);
    setNumeroCuota(2);
    setMontoUsd("");
    setMontoArs("");
    setFechaPago(todayISO());
    setMetodoPago("");
    setReceptor("");
    setComprobante(null);
    setError("");
    setSubmitted(false);
  }

  // ── Success ──
  if (submitted) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-10 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Pago registrado correctamente</h3>
        <p className="text-sm text-[var(--muted)]">El pago se guardo en Supabase.</p>
        <button
          onClick={reset}
          className="mt-2 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Registrar otro pago
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {([1, 2] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step === s
                  ? "bg-[var(--purple)] text-white"
                  : step > s
                  ? "bg-[var(--purple)]/30 text-purple-300"
                  : "bg-[var(--card-border)] text-[var(--muted)]"
              }`}
            >
              {s}
            </div>
            {s < 2 && (
              <div className={`h-px w-8 transition-colors ${step > s ? "bg-[var(--purple)]/50" : "bg-[var(--card-border)]"}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Buscar alumno ── */}
      {step === 1 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1">Buscar alumno</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Mostrando {leads.length} alumnos con deal cerrado
          </p>

          <input
            type="text"
            placeholder="Nombre, Instagram o closer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass}
            autoFocus
          />

          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="text-sm text-[var(--muted)] text-center py-6">
                No hay alumnos que coincidan.
              </p>
            )}
            {filtered.map((lead) => {
              const payments = paymentsByLead[lead.id] || [];
              const summary = getPaymentSummary(payments);
              const saldoPendiente = lead.ticket_total - summary.totalPagado;
              return (
                <button
                  key={lead.id}
                  onClick={() => selectLead(lead)}
                  className="w-full bg-[#111113] border border-[var(--card-border)] rounded-lg p-4 cursor-pointer hover:border-[var(--purple)]/50 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {lead.nombre || "Sin nombre"}
                    </span>
                    {saldoPendiente > 0 && (
                      <span className="text-xs text-amber-400">
                        Saldo: {formatUSD(saldoPendiente)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {lead.programa_pitcheado && (
                      <span className="text-xs text-purple-300">{PROGRAMS[lead.programa_pitcheado]?.label}</span>
                    )}
                    {lead.closer?.nombre && (
                      <span className="text-xs text-[var(--muted)]">Closer: {lead.closer.nombre}</span>
                    )}
                    <span className="text-xs text-[var(--muted)]">
                      {summary.pagadas}/{payments.length} pagadas
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 2: Info alumno + form pago ── */}
      {step === 2 && selected && (() => {
        const payments = paymentsByLead[selected.id] || [];
        const summary = getPaymentSummary(payments);
        const saldoPendiente = selected.ticket_total - summary.totalPagado;

        return (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
            <h2 className="text-base font-semibold mb-1">Registrar pago</h2>
            <p className="text-xs text-[var(--muted)] mb-5">{selected.nombre}</p>

            {/* Student info card */}
            <div className="bg-[#111113] border border-[var(--card-border)] rounded-lg p-4 mb-6 space-y-2">
              <InfoRow label="Programa" value={selected.programa_pitcheado ? PROGRAMS[selected.programa_pitcheado]?.label : undefined} />
              <InfoRow label="Closer" value={selected.closer?.nombre} />
              <InfoRow label="Setter" value={selected.setter?.nombre} />
              <InfoRow label="Plan de pago" value={selected.plan_pago || undefined} />
              <InfoRow label="Ticket total" value={selected.ticket_total > 0 ? formatUSD(selected.ticket_total) : undefined} />

              {/* Existing payments */}
              {payments.length > 0 && (
                <div className="pt-2 border-t border-[var(--card-border)] space-y-1">
                  {payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs">
                      <span className="text-[var(--muted)]">Cuota {p.numero_cuota}</span>
                      <span className={p.estado === "pagado" ? "text-green-400" : "text-amber-400"}>
                        {formatUSD(p.monto_usd)} - {p.estado}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {saldoPendiente > 0 && (
                <div className="pt-2 border-t border-[var(--card-border)]">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--muted)]">Saldo pendiente</span>
                    <span className="text-sm font-semibold text-amber-400">
                      {formatUSD(saldoPendiente)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment form */}
            <div className="space-y-4">
              {/* Numero cuota */}
              <div>
                <label className={labelClass}>Numero de cuota *</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={numeroCuota}
                  onChange={(e) => setNumeroCuota(parseInt(e.target.value) || 1)}
                  className={inputClass}
                />
              </div>

              {/* Fecha */}
              <div>
                <label className={labelClass}>Fecha de pago</label>
                <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={inputClass} />
              </div>

              {/* Monto USD */}
              <div>
                <label className={labelClass}>Monto USD *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={montoUsd}
                    onChange={(e) => setMontoUsd(e.target.value)}
                    placeholder="0"
                    className={`${inputClass} pl-7`}
                  />
                </div>
              </div>

              {/* Monto ARS (optional) */}
              <div>
                <label className={labelClass}>Monto ARS (opcional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                  <input
                    type="number"
                    min={0}
                    value={montoArs}
                    onChange={(e) => setMontoArs(e.target.value)}
                    placeholder="0"
                    className={`${inputClass} pl-7`}
                  />
                </div>
              </div>

              {/* Metodo de pago */}
              <div>
                <label className={labelClass}>Metodo de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className={selectClass}>
                  <option value="">Seleccionar...</option>
                  {METODOS_PAGO.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Receptor */}
              <div>
                <label className={labelClass}>Quien recibe el pago</label>
                <select value={receptor} onChange={(e) => setReceptor(e.target.value)} className={selectClass}>
                  <option value="">Seleccionar...</option>
                  {RECEPTORES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Comprobante upload */}
              <div>
                <label className={labelClass}>Comprobante (imagen/PDF)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[var(--muted)] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[var(--purple)]/10 file:text-purple-300 hover:file:bg-[var(--purple)]/20"
                />
                {comprobante && (
                  <p className="text-xs text-[var(--muted)] mt-1">{comprobante.name}</p>
                )}
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button onClick={volver} className="flex-1 bg-transparent border border-[var(--card-border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--foreground)] py-2.5 rounded-lg text-sm font-medium transition-colors">
                Volver
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? "Guardando..." : "Registrar pago"}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-[var(--muted)] shrink-0">{label}</span>
      <span className="text-sm text-[var(--foreground)] text-right">{value}</span>
    </div>
  );
}
