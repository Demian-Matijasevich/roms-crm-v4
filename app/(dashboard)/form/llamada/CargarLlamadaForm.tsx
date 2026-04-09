"use client";

import { useState, useMemo } from "react";
import type { AuthSession, TeamMember, LeadEstado, Programa } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { LEAD_ESTADOS_LABELS, PROGRAMS, RECEPTORES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

interface Props {
  leads: LeadWithTeam[];
  team: TeamMember[];
  session: AuthSession;
}

type Step = 1 | 2 | 3 | 4;

const METODOS_PAGO = [
  "mercado_pago", "transferencia", "cash", "binance", "stripe", "wise",
] as const;

const METODOS_PAGO_LABELS: Record<string, string> = {
  mercado_pago: "Mercado Pago",
  transferencia: "Transferencia",
  cash: "Efectivo",
  binance: "Binance",
  stripe: "Stripe",
  wise: "Wise",
};

const PLAN_PAGO_OPTIONS = [
  { value: "paid_in_full", label: "PIF (Paid in Full)" },
  { value: "2_cuotas", label: "2 Cuotas" },
  { value: "3_cuotas", label: "3 Cuotas" },
  { value: "personalizado", label: "Personalizado" },
];

const CALIFICACION_OPTIONS = [
  { value: "calificado", label: "Calificado" },
  { value: "no_calificado", label: "No calificado" },
  { value: "podria", label: "Podria" },
];

const CERRADO_ESTADOS: LeadEstado[] = ["cerrado", "reserva", "adentro_seguimiento"];

function isCerrado(estado: string): boolean {
  return CERRADO_ESTADOS.includes(estado as LeadEstado);
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const labelClass = "text-sm text-[var(--muted)] block mb-1";
const selectClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";

export default function CargarLlamadaForm({ leads, team, session }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadWithTeam | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 3 fields
  const [sePresento, setSePresento] = useState<"si" | "no" | "">("");
  const [estado, setEstado] = useState<string>("");
  const [calificado, setCalificado] = useState<string>("");
  const [programa, setPrograma] = useState<string>("");
  const [reporteGeneral, setReporteGeneral] = useState("");

  // Step 4 fields (payment)
  const [planPago, setPlanPago] = useState<string>("");
  const [ticketTotal, setTicketTotal] = useState("");
  const [cashDia1, setCashDia1] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [receptor, setReceptor] = useState("");
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);

  // Suppress unused variable warnings
  void team;
  void session;

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.nombre?.toLowerCase().includes(q) ||
        l.instagram?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  function selectLead(lead: LeadWithTeam) {
    setSelectedLead(lead);
    setStep(2);
  }

  function volver() {
    if (step === 2) { setSelectedLead(null); setStep(1); }
    else if (step === 3) { setStep(2); }
    else if (step === 4) { setStep(3); }
  }

  function handleStep3Next() {
    if (!sePresento || !estado) {
      setError("Completa Se Presento y Estado antes de continuar.");
      return;
    }
    setError("");
    if (isCerrado(estado)) {
      setStep(4);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!selectedLead) return;
    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      lead_id: selectedLead.id,
      estado,
      lead_calificado: calificado || undefined,
      programa_pitcheado: programa || undefined,
      reporte_general: reporteGeneral || undefined,
    };

    // If cerrado, include payment info
    if (isCerrado(estado)) {
      body.plan_pago = planPago || undefined;
      body.ticket_total = ticketTotal ? parseFloat(ticketTotal) : 0;

      // Upload comprobante if present
      let comprobanteUrl: string | undefined;
      if (comprobanteFile) {
        const formData = new FormData();
        formData.append("file", comprobanteFile);
        formData.append("lead_id", selectedLead.id);
        try {
          const uploadRes = await fetch("/api/pagos?upload=1", {
            method: "POST",
            body: formData,
          });
          const uploadJson = await uploadRes.json();
          if (uploadJson.ok && uploadJson.url) {
            comprobanteUrl = uploadJson.url;
          }
        } catch {
          // Continue without comprobante if upload fails
        }
      }

      body.payment = {
        monto_usd: cashDia1 ? parseFloat(cashDia1) : 0,
        metodo_pago: metodoPago || undefined,
        receptor: receptor || undefined,
        comprobante_url: comprobanteUrl || undefined,
      };
    }

    // If no-show, mark estado accordingly
    if (sePresento === "no" && estado === "pendiente") {
      body.estado = "no_show";
    }

    try {
      const res = await fetch("/api/llamadas", {
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
    setSelectedLead(null);
    setSePresento("");
    setEstado("");
    setCalificado("");
    setPrograma("");
    setReporteGeneral("");
    setPlanPago("");
    setTicketTotal("");
    setCashDia1("");
    setMetodoPago("");
    setReceptor("");
    setComprobanteFile(null);
    setError("");
    setSubmitted(false);
  }

  // ── Success state ──
  if (submitted) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-10 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Llamada cargada correctamente</h3>
        <p className="text-sm text-[var(--muted)]">Los datos se guardaron en Supabase.</p>
        <button
          onClick={reset}
          className="mt-2 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Cargar otra llamada
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {([1, 2, 3, 4] as Step[]).map((s) => (
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
            {s < 4 && (
              <div className={`h-px w-8 transition-colors ${step > s ? "bg-[var(--purple)]/50" : "bg-[var(--card-border)]"}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Buscar lead ── */}
      {step === 1 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1">Buscar lead</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Mostrando {leads.length} leads pendientes de cierre
          </p>

          <input
            type="text"
            placeholder="Nombre o Instagram..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass}
            autoFocus
          />

          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="text-sm text-[var(--muted)] text-center py-6">
                No hay leads que coincidan.
              </p>
            )}
            {filtered.map((lead) => (
              <button
                key={lead.id}
                onClick={() => selectLead(lead)}
                className="w-full bg-[#111113] border border-[var(--card-border)] rounded-lg p-4 cursor-pointer hover:border-[var(--purple)]/50 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--foreground)]">{lead.nombre || "Sin nombre"}</span>
                  {lead.fecha_agendado && (
                    <span className="text-xs text-[var(--muted)]">{formatDate(lead.fecha_agendado)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {lead.instagram && (
                    <span className="text-xs text-[var(--muted)]">@{lead.instagram.replace(/^@/, "")}</span>
                  )}
                  {lead.setter?.nombre && (
                    <span className="text-xs text-purple-300">Setter: {lead.setter.nombre}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Lead Card ── */}
      {step === 2 && selectedLead && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold mb-4">Detalle del lead</h2>

          <div className="space-y-3 mb-6">
            <InfoRow label="Nombre" value={selectedLead.nombre} />
            <InfoRow label="Instagram" value={selectedLead.instagram ? `@${selectedLead.instagram.replace(/^@/, "")}` : undefined} />
            <InfoRow label="Fecha agendada" value={selectedLead.fecha_agendado ? formatDate(selectedLead.fecha_agendado) : undefined} />
            <InfoRow label="Setter" value={selectedLead.setter?.nombre} />
            {selectedLead.contexto_setter && (
              <div className="pt-2 border-t border-[var(--card-border)]">
                <p className={labelClass}>Contexto setter</p>
                <p className="text-sm text-[var(--foreground)] leading-relaxed">{selectedLead.contexto_setter}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={volver} className="flex-1 bg-transparent border border-[var(--card-border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--foreground)] py-2.5 rounded-lg text-sm font-medium transition-colors">
              Volver
            </button>
            <button onClick={() => setStep(3)} className="flex-1 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
              Cargar resultado
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Resultado de la llamada ── */}
      {step === 3 && selectedLead && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1">Resultado de la llamada</h2>
          <p className="text-xs text-[var(--muted)] mb-5">{selectedLead.nombre}</p>

          <div className="space-y-4">
            {/* Se presento */}
            <div>
              <label className={labelClass}>Se presento *</label>
              <div className="flex gap-3">
                {(["si", "no"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSePresento(opt)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      sePresento === opt
                        ? opt === "si"
                          ? "bg-green-500/10 border-green-500 text-green-400"
                          : "bg-red-500/10 border-red-500 text-red-400"
                        : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    {opt === "si" ? "Si" : "No"}
                  </button>
                ))}
              </div>
            </div>

            {/* Estado */}
            <div>
              <label className={labelClass}>Estado *</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClass}>
                <option value="">Seleccionar estado...</option>
                {Object.entries(LEAD_ESTADOS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Lead calificado */}
            <div>
              <label className={labelClass}>Lead calificado</label>
              <div className="flex gap-2">
                {CALIFICACION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setCalificado(opt.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      calificado === opt.value
                        ? "bg-[var(--purple)]/10 border-[var(--purple)] text-purple-300"
                        : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Programa pitcheado */}
            <div>
              <label className={labelClass}>Programa pitcheado</label>
              <select value={programa} onChange={(e) => setPrograma(e.target.value)} className={selectClass}>
                <option value="">Sin programa / no aplica</option>
                {Object.entries(PROGRAMS).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Reporte general */}
            <div>
              <label className={labelClass}>Reporte de la llamada</label>
              <textarea
                value={reporteGeneral}
                onChange={(e) => setReporteGeneral(e.target.value)}
                rows={3}
                placeholder="Notas post-llamada, objeciones, proximos pasos..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 mt-6">
            <button onClick={volver} className="flex-1 bg-transparent border border-[var(--card-border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--foreground)] py-2.5 rounded-lg text-sm font-medium transition-colors">
              Volver
            </button>
            <button
              onClick={handleStep3Next}
              disabled={loading}
              className="flex-1 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? "Guardando..." : isCerrado(estado) ? "Siguiente - Pago" : "Guardar llamada"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Pago (solo si cerrado) ── */}
      {step === 4 && selectedLead && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1">Datos de pago</h2>
          <p className="text-xs text-[var(--muted)] mb-5">
            {selectedLead.nombre} - {LEAD_ESTADOS_LABELS[estado as LeadEstado] || estado}
          </p>

          <div className="space-y-4">
            {/* Plan de pago */}
            <div>
              <label className={labelClass}>Plan de pago *</label>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_PAGO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPlanPago(opt.value)}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      planPago === opt.value
                        ? "bg-[var(--purple)]/10 border-[var(--purple)] text-purple-300"
                        : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ticket total */}
            <div>
              <label className={labelClass}>Ticket total (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={ticketTotal}
                  onChange={(e) => setTicketTotal(e.target.value)}
                  placeholder="0"
                  className={`${inputClass} pl-7`}
                />
              </div>
            </div>

            {/* Monto cobrado hoy */}
            <div>
              <label className={labelClass}>Monto cobrado hoy (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={cashDia1}
                  onChange={(e) => setCashDia1(e.target.value)}
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
                  <option key={m} value={m}>{METODOS_PAGO_LABELS[m]}</option>
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

            {/* Comprobante */}
            <div>
              <label className={labelClass}>Comprobante de pago (opcional)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setComprobanteFile(e.target.files?.[0] || null)}
                className={`${inputClass} file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[var(--purple)]/15 file:text-[var(--purple-light)] hover:file:bg-[var(--purple)]/25`}
              />
              {comprobanteFile && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  Archivo: {comprobanteFile.name} ({(comprobanteFile.size / 1024).toFixed(0)} KB)
                </p>
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
              disabled={loading || !planPago}
              className="flex-1 bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? "Guardando..." : "Guardar llamada"}
            </button>
          </div>
        </div>
      )}
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
