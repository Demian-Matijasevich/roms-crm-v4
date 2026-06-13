"use client";
/**
 * Wizard EOD — UNA pregunta por vez con botones grandes.
 *
 * Flujo por lead:
 *   1. ¿Vino?  [Sí vino] [No show] [Reagendó] [Canceló]
 *   2. Si vino → Resultado? [Cerró] [Reserva] [Seguimiento] [No cierre]
 *   3. Si Cerró/Reserva → Ticket $$ + Receptor
 *   4. POST y avanza al siguiente.
 *
 * Al final: textarea comentario opcional + botón "Cerrar día".
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Lead = {
  id: string;
  nombre: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  programa_pitcheado: string | null;
  ticket_total: number | null;
  telefono: string | null;
  instagram: string | null;
};

type Props = {
  leads: Lead[];
  huerfanos: Lead[];
  totalDelDia: number;
  currentDate: string;
  todayStr: string;
  isAdmin: boolean;
  currentMemberId: string | null;
  currentNombre: string;
  filterCloser: string;
  initialComentario: string;
  comentarioTargetMemberId: string | null;
};

type Step = "presento" | "resultado" | "ticket" | "saved";

const PROGRAMAS = ["Setter", "Closer", "Premium", "ROMS", "VSL"];
const RECEPTORES = ["JUANMA", "VALE", "MEL", "MATI", "FRAN", "AGUS", "OTRO"];

function timeART(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  } catch { return "—"; }
}

export default function EodWizardClient(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [queue, setQueue] = useState<Lead[]>(props.leads);
  const [huerfanos, setHuerfanos] = useState<Lead[]>(props.huerfanos);
  const [current, setCurrent] = useState(0);
  const [step, setStep] = useState<Step>("presento");
  const [error, setError] = useState<string | null>(null);
  const [agarrando, setAgarrando] = useState<string | null>(null);

  // datos en construcción para el lead actual
  const [draftPresento, setDraftPresento] = useState<"si" | "no" | "cancelado" | null>(null);
  const [draftResultado, setDraftResultado] = useState<"cerrado" | "reserva" | "seguimiento" | "no_cierre" | "no_calificado" | "broke_cancelado" | null>(null);
  const [draftTicket, setDraftTicket] = useState<string>("");
  const [draftCobro, setDraftCobro] = useState<string>("");
  const [draftPrograma, setDraftPrograma] = useState<string>("");
  const [draftReceptor, setDraftReceptor] = useState<string>("");

  // comentario del día
  const [comentario, setComentario] = useState(props.initialComentario);
  const [comentarioSaved, setComentarioSaved] = useState(true);

  const lead = queue[current] || null;
  const remaining = queue.length - current;
  const completadas = props.totalDelDia - queue.length + current;

  function resetDraft() {
    setDraftPresento(null);
    setDraftResultado(null);
    setDraftTicket("");
    setDraftCobro("");
    setDraftPrograma("");
    setDraftReceptor("");
    setError(null);
  }

  function nextLead() {
    resetDraft();
    if (current + 1 >= queue.length) {
      setStep("saved");
    } else {
      setCurrent(current + 1);
      setStep("presento");
    }
  }

  async function saveLead(estado: string, payment?: { monto_usd: number; receptor: string }) {
    if (!lead) return;
    setError(null);

    const payload: Record<string, unknown> = {
      lead_id: lead.id,
      estado,
    };

    if (draftPresento) payload.se_presento = draftPresento;

    // Para cerrado/reserva agregamos los datos de pago + programa + ticket
    if (estado === "cerrado" || estado === "reserva") {
      const ticket = Number(draftTicket || 0);
      if (ticket > 0) payload.ticket_total = ticket;
      if (draftPrograma) payload.programa_pitcheado = draftPrograma;
      if (estado === "reserva") {
        // fecha estimada: 7 días por default si no se especifica
        const f = new Date();
        f.setDate(f.getDate() + 7);
        payload.fecha_cierre_estimada = f.toISOString().slice(0, 10);
      }
      const cobroNum = Number(draftCobro || 0);
      if (cobroNum > 0 && draftReceptor) {
        payload.payment = {
          monto_usd: cobroNum,
          receptor: draftReceptor,
          // Si el closer entra atrasado (?d=YYYY-MM-DD), el pago va con la fecha
          // del día de la llamada, no la fecha de hoy.
          fecha_pago: props.currentDate,
        };
      }
    }

    const res = await fetch("/api/llamadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `Error ${res.status}`);
      return;
    }
    nextLead();
  }

  async function guardarComentario() {
    if (!props.comentarioTargetMemberId) return;
    try {
      const res = await fetch("/api/cerrar-dia/comentario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: props.currentDate,
          comentario,
          team_member_id: props.comentarioTargetMemberId,
        }),
      });
      if (res.ok) setComentarioSaved(true);
    } catch {}
  }

  function handlePresento(val: "si" | "no" | "cancelado" | "reprogramada") {
    setError(null);
    if (val === "no") {
      setDraftPresento("no");
      // No show: directo POST con estado no_show
      void saveLead("no_show");
      return;
    }
    if (val === "cancelado") {
      setDraftPresento("cancelado");
      void saveLead("cancelada");
      return;
    }
    if (val === "reprogramada") {
      void saveLead("reprogramada");
      return;
    }
    // Sí vino: pasamos a paso resultado
    setDraftPresento("si");
    setStep("resultado");
  }

  function handleResultado(val: "cerrado" | "reserva" | "seguimiento" | "no_cierre" | "no_calificado" | "broke_cancelado") {
    setError(null);
    setDraftResultado(val);
    if (val === "cerrado" || val === "reserva") {
      setStep("ticket");
    } else {
      // Estados que no requieren ticket → guardar directo
      void saveLead(val);
    }
  }

  function handleTicketSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draftResultado) return;
    const ticket = Number(draftTicket || 0);
    if (draftResultado === "cerrado" && ticket <= 0) {
      setError("Cargá el ticket total cerrado.");
      return;
    }
    void saveLead(draftResultado);
  }

  async function tomarHuerfano(leadId: string) {
    if (!props.currentMemberId || agarrando) return;
    setAgarrando(leadId);
    const res = await fetch(`/api/leads/${leadId}/tomar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const taken = huerfanos.find((h) => h.id === leadId);
      if (taken) {
        setHuerfanos(huerfanos.filter((h) => h.id !== leadId));
        setQueue([...queue, taken].sort((a, b) =>
          (a.fecha_agendado || "").localeCompare(b.fecha_agendado || "")
        ));
      }
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "No se pudo tomar la llamada.");
    }
    setAgarrando(null);
  }

  // ─── PANTALLA: TODO HECHO ────────────────────────────────────
  if (step === "saved" || queue.length === 0) {
    const isCero = queue.length === 0;
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="text-6xl mb-4">{isCero ? "📭" : "✅"}</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            {isCero ? "Sin llamadas pendientes" : "¡Día cerrado!"}
          </h1>
          <p className="text-slate-500 mb-6">
            {isCero
              ? "No tenés calls sin marcar para hoy."
              : `Marcaste ${completadas} de ${props.totalDelDia} llamadas.`}
          </p>

          {/* Huérfanos del día — botón "Yo tomé esta" */}
          {huerfanos.length > 0 && !props.isAdmin && (
            <div className="text-left mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="text-sm font-semibold text-amber-900 mb-2">
                🆓 {huerfanos.length} sin asignar — ¿tomaste alguna?
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {huerfanos.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => tomarHuerfano(h.id)}
                    disabled={!!agarrando}
                    className="w-full text-left bg-white hover:bg-amber-100 active:bg-amber-200 border border-amber-200 rounded-xl px-3 py-2 transition disabled:opacity-50"
                  >
                    <div className="text-xs text-slate-500">
                      {timeART(h.fecha_agendado || h.fecha_llamada)}
                    </div>
                    <div className="font-semibold text-slate-800 text-sm">
                      {h.nombre || "Sin nombre"}
                    </div>
                    <div className="text-xs text-amber-700 font-medium mt-0.5">
                      {agarrando === h.id ? "Asignando…" : "Tap para tomar →"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {props.comentarioTargetMemberId && (
            <div className="text-left mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                📝 Comentario del día (opcional)
              </label>
              <textarea
                value={comentario}
                onChange={(e) => { setComentario(e.target.value); setComentarioSaved(false); }}
                onBlur={() => guardarComentario()}
                placeholder="Algo del día que quieras compartir con el equipo…"
                className="w-full min-h-[100px] rounded-xl border border-slate-200 p-3 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none"
              />
              <div className="text-xs text-slate-400 mt-1">
                {comentarioSaved ? "✓ Guardado" : "● Cambios sin guardar"}
              </div>
            </div>
          )}

          <button
            onClick={() => startTransition(() => router.push("/"))}
            className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-4 rounded-2xl text-lg transition shadow-lg shadow-emerald-200"
          >
            Volver al CRM
          </button>
        </div>
      </div>
    );
  }

  // ─── PANTALLA: PREGUNTAS ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header con progress */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => startTransition(() => router.push("/cerrar-dia"))} className="text-slate-400 text-sm">← Salir</button>
          <div className="text-sm font-semibold text-slate-700">
            {completadas + 1} / {props.totalDelDia}
          </div>
        </div>
        <div className="max-w-md mx-auto mt-2 bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${((completadas) / props.totalDelDia) * 100}%` }}
          />
        </div>
      </div>

      {/* Card central */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Header del lead */}
          <div className="bg-gradient-to-br from-slate-700 to-slate-900 text-white p-6">
            <div className="text-xs uppercase tracking-wider text-slate-300 mb-1">
              {timeART(lead!.fecha_agendado || lead!.fecha_llamada)} ART
              {remaining > 1 && <span className="ml-2 text-slate-400">· quedan {remaining - 1}</span>}
            </div>
            <div className="text-xl font-bold leading-tight">{lead!.nombre || "Sin nombre"}</div>
            {lead!.instagram && (
              <div className="text-sm text-slate-300 mt-1">@{lead!.instagram.replace(/^@/, "")}</div>
            )}
          </div>

          {/* Paso 1: ¿Vino? */}
          {step === "presento" && (
            <div className="p-6">
              <div className="text-lg font-semibold text-slate-700 mb-5 text-center">¿Vino?</div>
              <div className="space-y-3">
                <button onClick={() => handlePresento("si")} disabled={pending}
                  className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold rounded-2xl text-lg shadow-md shadow-emerald-200 transition disabled:opacity-50">
                  ✅ Sí vino
                </button>
                <button onClick={() => handlePresento("no")} disabled={pending}
                  className="w-full py-5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold rounded-2xl text-lg shadow-md shadow-rose-200 transition disabled:opacity-50">
                  ❌ No show
                </button>
                <button onClick={() => handlePresento("reprogramada")} disabled={pending}
                  className="w-full py-4 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-2xl text-base transition disabled:opacity-50">
                  📅 Reagendó
                </button>
                <button onClick={() => handlePresento("cancelado")} disabled={pending}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl text-base transition disabled:opacity-50">
                  🚫 Canceló
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: ¿Resultado? */}
          {step === "resultado" && (
            <div className="p-6">
              <div className="text-lg font-semibold text-slate-700 mb-5 text-center">¿Resultado?</div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => handleResultado("cerrado")} disabled={pending}
                  className="py-6 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-md transition disabled:opacity-50">
                  <div className="text-3xl mb-1">💰</div>
                  Cerró
                </button>
                <button onClick={() => handleResultado("reserva")} disabled={pending}
                  className="py-6 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-2xl shadow-md transition disabled:opacity-50">
                  <div className="text-3xl mb-1">📌</div>
                  Reserva
                </button>
                <button onClick={() => handleResultado("seguimiento")} disabled={pending}
                  className="py-6 bg-amber-400 hover:bg-amber-500 text-white font-bold rounded-2xl shadow-md transition disabled:opacity-50">
                  <div className="text-3xl mb-1">⏰</div>
                  Seguimiento
                </button>
                <button onClick={() => handleResultado("no_cierre")} disabled={pending}
                  className="py-6 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl shadow-md transition disabled:opacity-50">
                  <div className="text-3xl mb-1">🚫</div>
                  No cerró
                </button>
                <button onClick={() => handleResultado("no_calificado")} disabled={pending}
                  className="py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-2xl text-sm transition disabled:opacity-50">
                  No calificó
                </button>
                <button onClick={() => handleResultado("broke_cancelado")} disabled={pending}
                  className="py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-2xl text-sm transition disabled:opacity-50">
                  Sin plata
                </button>
              </div>
              <button onClick={() => { setStep("presento"); }} className="mt-4 w-full text-slate-400 text-sm py-2">← Atrás</button>
            </div>
          )}

          {/* Paso 3: Ticket + Pago (solo si cerró o reservó) */}
          {step === "ticket" && (
            <form onSubmit={handleTicketSubmit} className="p-6 space-y-4">
              <div className="text-lg font-semibold text-slate-700 text-center">
                {draftResultado === "cerrado" ? "💰 Datos del cierre" : "📌 Datos de la reserva"}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Ticket total (USD)</label>
                <input type="number" step="any" min={0} value={draftTicket} onChange={(e) => setDraftTicket(e.target.value)}
                  required={draftResultado === "cerrado"}
                  className="w-full px-4 py-4 text-2xl font-bold border-2 border-slate-200 rounded-2xl focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none"
                  placeholder="2500" autoFocus />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Programa</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROGRAMAS.map((p) => (
                    <button type="button" key={p} onClick={() => setDraftPrograma(p)}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition ${draftPrograma === p ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-slate-600 mb-1">¿Cobraste algo? (USD, opcional)</label>
                <input type="number" step="any" min={0} value={draftCobro} onChange={(e) => setDraftCobro(e.target.value)}
                  className="w-full px-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-2xl focus:border-emerald-400 outline-none mb-2"
                  placeholder="0" />
                {Number(draftCobro) > 0 && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Receptor</div>
                    <div className="flex flex-wrap gap-2">
                      {RECEPTORES.map((r) => (
                        <button type="button" key={r} onClick={() => setDraftReceptor(r)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${draftReceptor === r ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-xl">{error}</div>}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setStep("resultado")}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl text-sm">
                  ← Atrás
                </button>
                <button type="submit" disabled={pending}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold rounded-2xl text-base shadow-md disabled:opacity-50">
                  Guardar y siguiente →
                </button>
              </div>
            </form>
          )}

          {error && step !== "ticket" && (
            <div className="p-4 bg-rose-50 border-t border-rose-200 text-rose-700 text-sm text-center">{error}</div>
          )}
        </div>
      </div>

      {/* Footer mini */}
      <div className="text-center text-xs text-slate-400 pb-4">
        EOD · {props.currentNombre}{props.isAdmin && props.filterCloser ? " (admin)" : ""}
      </div>
    </div>
  );
}
