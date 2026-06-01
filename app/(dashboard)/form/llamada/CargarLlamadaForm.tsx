"use client";

import { useState, useMemo } from "react";
import type { AuthSession, TeamMember, LeadEstado, Programa } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { LEAD_ESTADOS_LABELS, PROGRAMS, RECEPTORES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

interface Props {
  leads: LeadWithTeam[];
  team: TeamMember[];
  usdRate: number;
  session: AuthSession;
  defaultNicho?: string;
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

export default function CargarLlamadaForm({ leads, team, usdRate, session, defaultNicho = "general" }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadWithTeam | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 3 fields
  const [sePresento, setSePresento] = useState<"si" | "no" | "cancelado" | "">("");
  const [estado, setEstado] = useState<string>("");
  const [calificado, setCalificado] = useState<string>("");
  const [programa, setPrograma] = useState<string>("");
  const [reporteGeneral, setReporteGeneral] = useState("");
  const [transcripcionUrl, setTranscripcionUrl] = useState("");
  const [cerradoEnLlamada, setCerradoEnLlamada] = useState<boolean>(true);
  const [nicho, setNicho] = useState<string>(defaultNicho);

  // Step 4 fields (payment)
  const [planPago, setPlanPago] = useState<string>("");
  const [ticketTotal, setTicketTotal] = useState("");
  const [cashDia1, setCashDia1] = useState("");
  const [cashCurrency, setCashCurrency] = useState<"USD" | "ARS">("USD");
  const [fechaPagoDia1, setFechaPagoDia1] = useState(new Date().toISOString().split("T")[0]);
  const [metodoPago, setMetodoPago] = useState("");
  const [receptor, setReceptor] = useState("");
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  // Cuotas futuras (vencimientos) — punto 1 audit Iñaki
  const [cuotas, setCuotas] = useState<Array<{ monto: string; fecha: string }>>([]);
  // Fecha estimada de cierre (solo reserva) — punto 6 audit Iñaki
  const [fechaCierreEstimada, setFechaCierreEstimada] = useState("");

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

  // Auto-genera fechas y montos sugeridos para cuotas futuras al elegir un plan.
  function selectPlan(value: string) {
    setPlanPago(value);
    let n = 0;
    if (value === "2_cuotas") n = 1;
    else if (value === "3_cuotas") n = 2;
    else if (value === "personalizado") n = Math.max(1, cuotas.length);

    // Monto sugerido = (ticket - cashDia1) / cuotas restantes
    const ticketNum = parseFloat(ticketTotal) || 0;
    const cashRaw = parseFloat(cashDia1) || 0;
    const cashUsd = cashCurrency === "USD" ? cashRaw : cashRaw > 0 ? Math.round(cashRaw / usdRate) : 0;
    const saldo = Math.max(0, ticketNum - cashUsd);
    const sugMonto = n > 0 ? Math.round(saldo / n) : 0;

    // Fechas sugeridas: +30 días, +60 días, etc desde fechaPagoDia1
    const baseDate = fechaPagoDia1 || new Date().toISOString().slice(0, 10);
    function addDays(dateStr: string, days: number): string {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }

    setCuotas((prev) => {
      const next = [...prev];
      while (next.length < n) {
        const idx = next.length + 1;
        next.push({
          monto: sugMonto > 0 ? String(sugMonto) : "",
          fecha: addDays(baseDate, 30 * idx),
        });
      }
      next.length = n;
      return next;
    });
  }

  // Recalcula fechas/montos sugeridos sin pisar lo que el closer ya tipeó.
  function autoFillCuotas() {
    const ticketNum = parseFloat(ticketTotal) || 0;
    const cashRaw = parseFloat(cashDia1) || 0;
    const cashUsd = cashCurrency === "USD" ? cashRaw : cashRaw > 0 ? Math.round(cashRaw / usdRate) : 0;
    const saldo = Math.max(0, ticketNum - cashUsd);
    const n = cuotas.length;
    if (n === 0) return;
    const sugMonto = Math.round(saldo / n);
    const baseDate = fechaPagoDia1 || new Date().toISOString().slice(0, 10);
    function addDays(dateStr: string, days: number): string {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }
    setCuotas((prev) =>
      prev.map((c, i) => ({
        monto: c.monto || (sugMonto > 0 ? String(sugMonto) : ""),
        fecha: c.fecha || addDays(baseDate, 30 * (i + 1)),
      }))
    );
  }

  function updateCuota(idx: number, field: "monto" | "fecha", val: string) {
    setCuotas((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: val } : c)));
  }

  function addCuota() {
    setCuotas((prev) => [...prev, { monto: "", fecha: "" }]);
  }

  function removeCuota(idx: number) {
    setCuotas((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!selectedLead) return;

    // ── Validaciones audit Iñaki ──
    // P2: estado "cerrado" exige cargar el cash cobrado.
    if (estado === "cerrado" && !(cashDia1 && parseFloat(cashDia1) > 0)) {
      setError("El estado Cerrado exige cargar el monto cobrado (cash dia 1).");
      return;
    }
    // P6: una reserva exige la fecha estimada de cierre.
    if (estado === "reserva" && !fechaCierreEstimada) {
      setError("Una reserva exige cargar la fecha estimada de cierre.");
      return;
    }
    // P1: si hay plan en cuotas, cada cuota necesita su fecha de vencimiento.
    if (isCerrado(estado) && cuotas.length > 0 && cuotas.some((c) => !c.fecha)) {
      setError("Cargá la fecha de vencimiento de todas las cuotas.");
      return;
    }

    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      lead_id: selectedLead.id,
      estado,
      lead_calificado: calificado || undefined,
      programa_pitcheado: programa || undefined,
      reporte_general: reporteGeneral || undefined,
      // 025 — Secure Scale improvements
      se_presento: sePresento || undefined,
      transcripcion_url: transcripcionUrl || undefined,
      // 028 — Nicho/vertical del lead
      nicho: nicho || undefined,
    };

    // If cerrado, include payment info + cerrado_en_llamada
    if (isCerrado(estado)) {
      body.plan_pago = planPago || undefined;
      body.ticket_total = ticketTotal ? parseFloat(ticketTotal) : 0;
      // 025 — Si cerró, indicar si fue en la llamada o en seguimiento
      if (estado === "cerrado") {
        body.cerrado_en_llamada = cerradoEnLlamada;
      }
      if (estado === "reserva" && fechaCierreEstimada) {
        body.fecha_cierre_estimada = fechaCierreEstimada;
      }
      // Cuotas futuras (pendientes) — punto 1 audit
      if (cuotas.length > 0) {
        body.cuotas = cuotas.map((c, i) => ({
          numero_cuota: i + 2,
          monto_usd: c.monto ? parseFloat(c.monto) : 0,
          fecha_vencimiento: c.fecha,
        }));
      }

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

      const cashRaw = cashDia1 ? parseFloat(cashDia1) : 0;
      const paymentMontoUsd = cashCurrency === "USD" ? cashRaw : Math.round(cashRaw / usdRate);
      const paymentMontoArs = cashCurrency === "ARS" ? cashRaw : 0;
      body.payment = {
        monto_usd: paymentMontoUsd,
        monto_ars: paymentMontoArs,
        fecha_pago: fechaPagoDia1 || undefined,
        metodo_pago: metodoPago || undefined,
        receptor: receptor || undefined,
        comprobante_url: comprobanteUrl || undefined,
      };
    }

    // Si no se presentó (no_show) y no se eligió un estado de post-llamada, forzamos no_show.
    if (sePresento === "no" && estado === "pendiente") {
      body.estado = "no_show";
    }
    // Si avisó que cancelaba, marcar el estado como cancelada.
    if (sePresento === "cancelado" && estado === "pendiente") {
      body.estado = "cancelada";
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
    setTranscripcionUrl("");
    setCerradoEnLlamada(true);
    setNicho(defaultNicho);
    setPlanPago("");
    setTicketTotal("");
    setCashDia1("");
    setFechaPagoDia1(new Date().toISOString().split("T")[0]);
    setMetodoPago("");
    setReceptor("");
    setComprobanteFile(null);
    setCuotas([]);
    setFechaCierreEstimada("");
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
            {/* Se presento — tres estados separados de "Situación" */}
            <div>
              <label className={labelClass}>¿Se presentó? *</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "si", label: "Sí, vino", c: "green" },
                  { v: "no", label: "No show", c: "red" },
                  { v: "cancelado", label: "Canceló antes", c: "amber" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setSePresento(opt.v)}
                    className={`py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                      sePresento === opt.v
                        ? opt.c === "green"
                          ? "bg-green-500/10 border-green-500 text-green-400"
                          : opt.c === "red"
                          ? "bg-red-500/10 border-red-500 text-red-400"
                          : "bg-amber-500/10 border-amber-500 text-amber-400"
                        : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-1.5">
                Show up rate se calcula con este campo, independiente de la situación.
              </p>
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

            {/* Nicho / vertical */}
            <div>
              <label className={labelClass}>Nicho del cliente</label>
              <select value={nicho} onChange={(e) => setNicho(e.target.value)} className={selectClass}>
                <option value="general">🛒 Normal (ecomm / negocios)</option>
                <option value="politica">🏛 Política</option>
                <option value="otro">📦 Otro</option>
              </select>
              <p className="text-[10px] text-[var(--muted)] mt-1">
                Permite filtrar la app por vista (Normal / Política). Default: Normal.
              </p>
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

            {/* Transcripción / grabación */}
            <div>
              <label className={labelClass}>Link grabación / transcripción</label>
              <input
                type="url"
                value={transcripcionUrl}
                onChange={(e) => setTranscripcionUrl(e.target.value)}
                placeholder="https://fathom.video/share/... o link Drive"
                className={inputClass}
              />
              <p className="text-[10px] text-[var(--muted)] mt-1">Opcional — Fathom, Loom, Drive, etc.</p>
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
            {/* 025 — Cerrado en llamada vs en seguimiento */}
            {estado === "cerrado" && (
              <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cerradoEnLlamada}
                    onChange={(e) => setCerradoEnLlamada(e.target.checked)}
                    className="mt-1 w-4 h-4"
                  />
                  <div>
                    <p className="text-sm text-white font-medium">
                      {cerradoEnLlamada ? "Cerrado en la misma llamada" : "Cerrado en seguimiento (después)"}
                    </p>
                    <p className="text-[10px] text-[var(--muted)] mt-0.5">
                      Si destildás esto, el cierre cuenta como "en seguimiento" (vino a una llamada antes pero cerró después).
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Plan de pago */}
            <div>
              <label className={labelClass}>Plan de pago *</label>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_PAGO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => selectPlan(opt.value)}
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

            {/* Fecha estimada de cierre (solo reserva) — punto 6 audit */}
            {estado === "reserva" && (
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
                <label className={labelClass}>Fecha estimada de cierre *</label>
                <input
                  type="date"
                  value={fechaCierreEstimada}
                  onChange={(e) => setFechaCierreEstimada(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  Deadline en que el cliente termina de pagar / cierra el programa completo.
                </p>
              </div>
            )}

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
              <label className={labelClass}>Moneda del cash día 1</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setCashCurrency("USD")}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    cashCurrency === "USD"
                      ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]"
                      : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                  }`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setCashCurrency("ARS")}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    cashCurrency === "ARS"
                      ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]"
                      : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                  }`}
                >
                  ARS
                </button>
              </div>
              <label className={labelClass}>Monto cobrado hoy ({cashCurrency})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={cashCurrency === "USD" ? 100 : 10000}
                  value={cashDia1}
                  onChange={(e) => setCashDia1(e.target.value)}
                  placeholder="0"
                  className={`${inputClass} pl-7`}
                />
              </div>
              {cashDia1 && parseFloat(cashDia1) > 0 && (
                <p className="text-xs text-[var(--muted)] mt-1.5">
                  {cashCurrency === "ARS" ? (
                    <>≈ <span className="text-[var(--purple-light)] font-medium">${Math.round(parseFloat(cashDia1) / usdRate).toLocaleString("en-US")} USD</span> (cotización ${usdRate.toLocaleString("es-AR")})</>
                  ) : (
                    <>≈ <span className="text-[var(--purple-light)] font-medium">${Math.round(parseFloat(cashDia1) * usdRate).toLocaleString("es-AR")} ARS</span> (cotización ${usdRate.toLocaleString("es-AR")})</>
                  )}
                </p>
              )}
            </div>

            {/* Fecha de pago */}
            <div>
              <label className={labelClass}>Fecha de pago (cuota 1)</label>
              <input
                type="date"
                value={fechaPagoDia1}
                onChange={(e) => setFechaPagoDia1(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Cuotas restantes — punto 1 audit Iñaki */}
            {(planPago === "2_cuotas" || planPago === "3_cuotas" || planPago === "personalizado") && (
              <div className="bg-[var(--purple)]/5 border border-[var(--purple)]/30 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Cuotas restantes — fecha obligatoria
                  </p>
                  <button
                    type="button"
                    onClick={autoFillCuotas}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-[var(--purple)]/20 hover:bg-[var(--purple)]/30 text-[var(--purple-light)]"
                    title="Sugerencia: monto = saldo/n, fechas a +30/+60/+90 días"
                  >
                    ✨ Auto-completar +30d
                  </button>
                </div>
                {cuotas.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.2fr_auto_auto] gap-2 items-end">
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Cuota {i + 2} — monto USD</label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={c.monto}
                        onChange={(e) => updateCuota(i, "monto", e.target.value)}
                        placeholder="0"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted)] block mb-1">Vencimiento *</label>
                      <input
                        type="date"
                        value={c.fecha}
                        onChange={(e) => updateCuota(i, "fecha", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    {/* Atajos +/-7d */}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!c.fecha) return;
                          const d = new Date(c.fecha + "T00:00:00");
                          d.setDate(d.getDate() - 7);
                          updateCuota(i, "fecha", d.toISOString().slice(0, 10));
                        }}
                        className="h-[42px] px-2 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-xs hover:bg-white/5"
                        title="-7 días"
                      >
                        −7d
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!c.fecha) return;
                          const d = new Date(c.fecha + "T00:00:00");
                          d.setDate(d.getDate() + 7);
                          updateCuota(i, "fecha", d.toISOString().slice(0, 10));
                        }}
                        className="h-[42px] px-2 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-xs hover:bg-white/5"
                        title="+7 días"
                      >
                        +7d
                      </button>
                    </div>
                    {planPago === "personalizado" && (
                      <button
                        type="button"
                        onClick={() => removeCuota(i)}
                        className="h-[42px] px-3 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {planPago === "personalizado" && (
                  <button
                    type="button"
                    onClick={addCuota}
                    className="w-full py-2 rounded-lg border border-[var(--purple)]/40 text-[var(--purple-light)] text-sm font-medium hover:bg-[var(--purple)]/10 transition-colors"
                  >
                    + Agregar cuota
                  </button>
                )}
                {/* Validación visual: suma de cuotas vs saldo */}
                {(() => {
                  const ticketNum = parseFloat(ticketTotal) || 0;
                  const cashRaw = parseFloat(cashDia1) || 0;
                  const cashUsd = cashCurrency === "USD" ? cashRaw : cashRaw > 0 ? Math.round(cashRaw / usdRate) : 0;
                  const saldo = Math.max(0, ticketNum - cashUsd);
                  const sumaCuotas = cuotas.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
                  const diff = saldo - sumaCuotas;
                  if (Math.abs(diff) < 1 || saldo === 0) return null;
                  return (
                    <p className={`text-xs ${Math.abs(diff) > 10 ? "text-amber-300" : "text-[var(--muted)]"}`}>
                      ⚠️ Suma cuotas (${sumaCuotas.toLocaleString()}) {diff > 0 ? "menor" : "mayor"} al saldo (${saldo.toLocaleString()}). Diferencia: ${Math.abs(diff).toLocaleString()}
                    </p>
                  );
                })()}
                <p className="text-xs text-[var(--muted)]">
                  Estas cuotas se cargan como pagos pendientes y alimentan la cola de cobranzas.
                </p>
              </div>
            )}

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
