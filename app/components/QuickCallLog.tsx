"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { LEAD_ESTADOS_LABELS, PROGRAMS, RECEPTORES } from "@/lib/constants";

interface QuickCallLogProps {
  session: {
    team_member_id: string;
    nombre: string;
    roles: string[];
    is_admin: boolean;
  };
}

interface LeadSearchResult {
  id: string;
  nombre: string;
  instagram: string | null;
  estado: string;
}

const QUICK_ESTADOS = [
  { value: "cerrado", label: "Cerro", color: "bg-green-500/10 border-green-500 text-green-400" },
  { value: "no_cierre", label: "No Cierre", color: "bg-red-500/10 border-red-500 text-red-400" },
  { value: "no_show", label: "No Show", color: "bg-yellow-500/10 border-yellow-500 text-yellow-400" },
  { value: "seguimiento", label: "Seguimiento", color: "bg-blue-500/10 border-blue-500 text-blue-400" },
  { value: "reprogramada", label: "Re-programar", color: "bg-purple-500/10 border-purple-500 text-purple-400" },
];

const METODOS_PAGO_LABELS: Record<string, string> = {
  mercado_pago: "Mercado Pago",
  transferencia: "Transferencia",
  cash: "Efectivo",
  binance: "Binance",
  stripe: "Stripe",
  wise: "Wise",
};

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const selectClass = inputClass;

export default function QuickCallLog({ session }: QuickCallLogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadSearchResult | null>(null);
  const [estado, setEstado] = useState("");
  const [programa, setPrograma] = useState("");
  const [ticketTotal, setTicketTotal] = useState("");
  const [cashDia1, setCashDia1] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [receptor, setReceptor] = useState("");
  const [planPago, setPlanPago] = useState("");
  const [reporteGeneral, setReporteGeneral] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isCloser = session.roles.includes("closer") || session.is_admin;
  const isCerrado = estado === "cerrado" || estado === "reserva" || estado === "adentro_seguimiento";

  // Don't render if not a closer/admin
  if (!isCloser) return null;

  const searchLeads = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=leads`);
      const data = await res.json();
      setResults((data.leads || []).slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchLeads(val), 300);
  };

  const handleSubmit = async () => {
    if (!selectedLead || !estado) {
      setError("Selecciona un lead y un estado");
      return;
    }
    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      lead_id: selectedLead.id,
      estado,
      programa_pitcheado: programa || undefined,
      reporte_general: reporteGeneral || undefined,
    };

    if (isCerrado) {
      body.plan_pago = planPago || undefined;
      body.ticket_total = ticketTotal ? parseFloat(ticketTotal) : 0;
      body.payment = {
        monto_usd: cashDia1 ? parseFloat(cashDia1) : 0,
        metodo_pago: metodoPago || undefined,
        receptor: receptor || undefined,
      };
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
      setSuccess(true);
      setTimeout(() => {
        resetForm();
        setOpen(false);
        window.location.reload();
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSearch("");
    setResults([]);
    setSelectedLead(null);
    setEstado("");
    setPrograma("");
    setTicketTotal("");
    setCashDia1("");
    setMetodoPago("");
    setReceptor("");
    setPlanPago("");
    setReporteGeneral("");
    setError("");
    setSuccess(false);
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => {
          setOpen(true);
          resetForm();
        }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white shadow-lg shadow-purple-500/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Cargar llamada rapida"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </button>

      {/* Modal Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-[var(--card-bg)] border-b border-[var(--card-border)] px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--foreground)]">Cargar Llamada Rapida</h2>
                <p className="text-xs text-[var(--muted)]">Registro rapido de resultado</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-5">
              {success ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-green-400">Llamada cargada correctamente</p>
                </div>
              ) : (
                <>
                  {/* Step 1: Search lead */}
                  {!selectedLead ? (
                    <div className="space-y-3">
                      <label className="text-sm text-[var(--muted)] block">Buscar lead</label>
                      <input
                        type="text"
                        placeholder="Nombre o Instagram..."
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className={inputClass}
                        autoFocus
                      />
                      {searching && <p className="text-xs text-[var(--muted)]">Buscando...</p>}
                      {results.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {results.map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => setSelectedLead(lead)}
                              className="w-full bg-white/5 border border-[var(--card-border)] rounded-lg px-4 py-2.5 text-left hover:border-[var(--purple)]/50 transition-colors"
                            >
                              <span className="text-sm font-medium">{lead.nombre}</span>
                              {lead.instagram && (
                                <span className="text-xs text-[var(--muted)] ml-2">@{lead.instagram.replace(/^@/, "")}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Selected lead header */}
                      <div className="flex items-center justify-between bg-[var(--purple)]/10 border border-[var(--purple)]/20 rounded-lg px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{selectedLead.nombre}</p>
                          {selectedLead.instagram && (
                            <p className="text-xs text-[var(--muted)]">@{selectedLead.instagram.replace(/^@/, "")}</p>
                          )}
                        </div>
                        <button
                          onClick={() => { setSelectedLead(null); setEstado(""); }}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          Cambiar
                        </button>
                      </div>

                      {/* Quick estado selection */}
                      <div className="space-y-2">
                        <label className="text-sm text-[var(--muted)] block">Resultado</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {QUICK_ESTADOS.map((e) => (
                            <button
                              key={e.value}
                              onClick={() => setEstado(e.value)}
                              className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                estado === e.value ? e.color : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                              }`}
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* If cerrado, show payment fields */}
                      {isCerrado && (
                        <div className="space-y-4 pt-2 border-t border-[var(--card-border)]">
                          <div>
                            <label className="text-sm text-[var(--muted)] block mb-1">Programa</label>
                            <select value={programa} onChange={(e) => setPrograma(e.target.value)} className={selectClass}>
                              <option value="">Seleccionar...</option>
                              {Object.entries(PROGRAMS).map(([key, p]) => (
                                <option key={key} value={key}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm text-[var(--muted)] block mb-1">Ticket USD</label>
                              <input type="number" min={0} step={100} value={ticketTotal} onChange={(e) => setTicketTotal(e.target.value)} placeholder="0" className={inputClass} />
                            </div>
                            <div>
                              <label className="text-sm text-[var(--muted)] block mb-1">Cash hoy USD</label>
                              <input type="number" min={0} step={100} value={cashDia1} onChange={(e) => setCashDia1(e.target.value)} placeholder="0" className={inputClass} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm text-[var(--muted)] block mb-1">Metodo pago</label>
                              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className={selectClass}>
                                <option value="">Seleccionar...</option>
                                {Object.entries(METODOS_PAGO_LABELS).map(([key, label]) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-sm text-[var(--muted)] block mb-1">Receptor</label>
                              <select value={receptor} onChange={(e) => setReceptor(e.target.value)} className={selectClass}>
                                <option value="">Seleccionar...</option>
                                {RECEPTORES.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm text-[var(--muted)] block mb-1">Plan de pago</label>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { value: "paid_in_full", label: "PIF" },
                                { value: "2_cuotas", label: "2 Cuotas" },
                                { value: "3_cuotas", label: "3 Cuotas" },
                                { value: "personalizado", label: "Custom" },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setPlanPago(opt.value)}
                                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
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
                        </div>
                      )}

                      {/* Notes */}
                      {estado && (
                        <div>
                          <label className="text-sm text-[var(--muted)] block mb-1">Notas (opcional)</label>
                          <textarea
                            value={reporteGeneral}
                            onChange={(e) => setReporteGeneral(e.target.value)}
                            rows={2}
                            placeholder="Notas post-llamada..."
                            className={`${inputClass} resize-none`}
                          />
                        </div>
                      )}

                      {error && <p className="text-sm text-red-400">{error}</p>}

                      {/* Submit */}
                      {estado && (
                        <button
                          onClick={handleSubmit}
                          disabled={loading}
                          className="w-full bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
                        >
                          {loading ? "Guardando..." : "Cargar resultado"}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
