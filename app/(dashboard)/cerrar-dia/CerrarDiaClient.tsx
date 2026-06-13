"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

interface Lead {
  id: string;
  nombre: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: string;
  closer_id: string | null;
  setter_id: string | null;
  programa_pitcheado: string | null;
  ticket_total: number | null;
  plan_pago: string | null;
  se_presento: string | null;
  lead_score: string | null;
  notas_internas: string | null;
  contexto_setter: string | null;
  reporte_general: string | null;
  telefono: string | null;
  nicho: string | null;
  closer?: { id: string; nombre: string } | null;
  setter?: { id: string; nombre: string } | null;
}

interface CloserOpt {
  id: string;
  nombre: string;
}

interface Props {
  leads: Lead[];
  closers: CloserOpt[];
  currentDate: string;
  todayStr: string;
  isAdmin: boolean;
  currentMemberId: string | null;
  currentNombre: string;
  filterCloser: string;
  initialComentario?: string;
  comentarioTargetMemberId?: string | null;
}

type ColKey = "por_llamar" | "show" | "seguimiento" | "cerrado_perdido";

const COLUMNS: { key: ColKey; title: string; helper: string; color: string; border: string }[] = [
  { key: "por_llamar", title: "Por llamar", helper: "Pendientes de hacer la llamada", color: "bg-purple-500/20 text-purple-300", border: "border-purple-500/30" },
  { key: "show", title: "Se presentó", helper: "Vino a la llamada", color: "bg-blue-500/20 text-blue-300", border: "border-blue-500/30" },
  { key: "seguimiento", title: "Seguimiento", helper: "No cerró, sigue conversando", color: "bg-yellow-500/20 text-yellow-300", border: "border-yellow-500/30" },
  { key: "cerrado_perdido", title: "Cerrado / Perdido", helper: "Cerró cash o se cayó", color: "bg-green-500/20 text-green-300", border: "border-green-500/30" },
];

function classify(l: Lead): ColKey {
  const e = l.estado;
  if (e === "cerrado" || e === "adentro_seguimiento" || e === "reserva" || e === "no_show" || e === "cancelada" || e === "no_calificado" || e === "no_cierre" || e === "broke_cancelado") {
    return "cerrado_perdido";
  }
  if (e === "seguimiento") return "seguimiento";
  // Tiene se_presento si vino → bajo "Se presentó" temporalmente
  if (l.se_presento === "si") return "show";
  return "por_llamar";
}

export default function CerrarDiaClient({ leads: leadsProp, closers, currentDate, todayStr, isAdmin, currentMemberId, currentNombre, filterCloser, initialComentario = "", comentarioTargetMemberId = null }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(leadsProp);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<Lead | null>(null);
  const [perdiendo, setPerdiendo] = useState<Lead | null>(null);
  const [comentario, setComentario] = useState<string>(initialComentario);
  const [comentarioSaved, setComentarioSaved] = useState<string>(initialComentario);
  const [savingComentario, setSavingComentario] = useState(false);
  const comentarioDirty = comentario !== comentarioSaved;

  async function guardarComentario() {
    setSavingComentario(true);
    try {
      const body: Record<string, unknown> = { fecha: currentDate, comentario };
      if (comentarioTargetMemberId && isAdmin) body.team_member_id = comentarioTargetMemberId;
      const res = await fetch("/api/cerrar-dia/comentario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || res.statusText}`);
      } else {
        setComentarioSaved(comentario);
      }
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingComentario(false);
    }
  }

  const buckets = useMemo(() => {
    const m: Record<ColKey, Lead[]> = { por_llamar: [], show: [], seguimiento: [], cerrado_perdido: [] };
    for (const l of leads) m[classify(l)].push(l);
    return m;
  }, [leads]);

  function setLeadLocal(id: string, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function saveLead(id: string, body: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/llamadas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: id, ...body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || res.statusText}`);
        return false;
      }
      return true;
    } catch (e) {
      alert(`Error de red: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  // Mover a "Se presentó" sin fricción
  async function marcarShow(lead: Lead) {
    setLeadLocal(lead.id, { se_presento: "si", estado: "seguimiento" });
    await saveLead(lead.id, { estado: lead.estado === "pendiente" ? "seguimiento" : lead.estado, se_presento: "si" });
  }

  // Mover a "Seguimiento" — pidiendo solo se_presento
  async function marcarSeguimiento(lead: Lead) {
    setLeadLocal(lead.id, { estado: "seguimiento", se_presento: lead.se_presento || "si" });
    await saveLead(lead.id, { estado: "seguimiento", se_presento: lead.se_presento || "si" });
  }

  // Mover a "Cerrado/Perdido" — abrir modal de cierre o perdido
  function onDropEnCerradoPerdido(lead: Lead) {
    setCerrando(lead);
  }

  async function applyCerrar(lead: Lead, body: Record<string, unknown>) {
    const ok = await saveLead(lead.id, body);
    if (ok) {
      setLeadLocal(lead.id, body as Partial<Lead>);
      setCerrando(null);
      // Refresca para que el monto cobrado se reflejen
      router.refresh();
    }
  }

  async function applyPerder(lead: Lead, motivo: string, estadoFinal: string) {
    const ok = await saveLead(lead.id, { estado: estadoFinal, se_presento: lead.se_presento || (estadoFinal === "no_show" ? "no" : "si"), notas_internas: motivo ? `${lead.notas_internas || ""}\n[Perdido] ${motivo}`.trim() : lead.notas_internas });
    if (ok) {
      setLeadLocal(lead.id, { estado: estadoFinal });
      setPerdiendo(null);
    }
  }

  function setDate(d: string) {
    const sp = new URLSearchParams(window.location.search);
    sp.set("d", d);
    router.push(`/cerrar-dia?${sp.toString()}`);
  }

  function setCloser(closer: string) {
    const sp = new URLSearchParams(window.location.search);
    if (closer) sp.set("closer", closer);
    else sp.delete("closer");
    router.push(`/cerrar-dia?${sp.toString()}`);
  }

  const cuentaCerrados = buckets.cerrado_perdido.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva").length;
  const cuentaPerdidos = buckets.cerrado_perdido.length - cuentaCerrados;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">📅 Cerrar el día — {currentDate === todayStr ? "Hoy" : currentDate}</h1>
          <p className="text-sm text-[var(--muted)]">
            {leads.length} llamadas · {buckets.show.length} se presentaron · {cuentaCerrados} cerrados · {cuentaPerdidos} perdidos · {buckets.seguimiento.length} en seguimiento
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <a
            href={`/eod${currentDate !== todayStr ? `?d=${currentDate}` : ""}${isAdmin && filterCloser ? `${currentDate !== todayStr ? "&" : "?"}closer=${filterCloser}` : ""}`}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg px-4 py-2 text-sm shadow-md shadow-emerald-200 transition"
          >
            ⚡ EOD rápido
          </a>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setDate(e.target.value)}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
          />
          {isAdmin && (
            <select
              value={filterCloser}
              onChange={(e) => setCloser(e.target.value)}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
            >
              <option value="">Todos los closers</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Comentario del día */}
      {comentarioTargetMemberId && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="text-sm font-semibold flex items-center gap-2">
              📝 Comentario del día
              {isAdmin && filterCloser && (
                <span className="text-xs text-[var(--muted)] font-normal">
                  ({closers.find((c) => c.id === filterCloser)?.nombre || "—"})
                </span>
              )}
            </label>
            {comentarioDirty && (
              <span className="text-[11px] text-amber-400">● Cambios sin guardar</span>
            )}
            {!comentarioDirty && comentarioSaved && (
              <span className="text-[11px] text-[var(--muted)]">✓ Guardado</span>
            )}
          </div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Notas, problemas, observaciones, contexto del día... (se incluye en el EOD de la noche)"
            className="w-full bg-[#0d0d0f] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] resize-y min-h-[80px]"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={guardarComentario}
              disabled={!comentarioDirty || savingComentario}
              className="px-4 py-1.5 text-xs rounded-lg bg-[var(--purple)]/20 border border-[var(--purple)]/40 text-[var(--purple)] hover:bg-[var(--purple)]/30 disabled:opacity-40"
            >
              {savingComentario ? "Guardando..." : "💾 Guardar comentario"}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {leads.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center space-y-3">
          {isAdmin ? (
            <>
              <p className="text-lg font-semibold mb-1">📭 Sin llamadas {currentDate === todayStr ? "hoy" : `el ${currentDate}`} para {filterCloser ? "este closer" : "el equipo"}</p>
              <p className="text-sm text-[var(--muted)]">
                {filterCloser
                  ? "Probá poner 'Todos los closers' o cambiá la fecha."
                  : "Cambiá la fecha arriba o filtrá por un closer específico."}
              </p>
              <div className="flex gap-2 justify-center flex-wrap pt-2">
                <button onClick={() => setDate(todayStr)} className="text-xs px-3 py-1.5 rounded bg-[var(--purple)]/15 border border-[var(--purple)]/30 text-[var(--purple)] hover:bg-[var(--purple)]/25">Hoy</button>
                <button onClick={() => {
                  const y = new Date(todayStr + "T12:00:00"); y.setDate(y.getDate() - 1);
                  setDate(y.toISOString().slice(0, 10));
                }} className="text-xs px-3 py-1.5 rounded bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--purple)]/40">Ayer</button>
                <button onClick={() => {
                  const y = new Date(todayStr + "T12:00:00"); y.setDate(y.getDate() - 7);
                  setDate(y.toISOString().slice(0, 10));
                }} className="text-xs px-3 py-1.5 rounded bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--purple)]/40">Hace 1 semana</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold mb-1">🎉 No tenés llamadas agendadas hoy</p>
              <p className="text-sm text-[var(--muted)]">Si te falta alguna, cambiá la fecha arriba. Hola {currentNombre}.</p>
            </>
          )}
        </div>
      )}

      {/* Kanban */}
      {leads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setDraggedId(null);
                if (!id) return;
                const lead = leads.find((l) => l.id === id);
                if (!lead) return;
                const from = classify(lead);
                if (from === col.key) return;
                if (col.key === "show") marcarShow(lead);
                else if (col.key === "seguimiento") marcarSeguimiento(lead);
                else if (col.key === "cerrado_perdido") onDropEnCerradoPerdido(lead);
                else if (col.key === "por_llamar") {
                  setLeadLocal(lead.id, { estado: "pendiente", se_presento: null });
                  saveLead(lead.id, { estado: "pendiente" });
                }
              }}
            >
              <div className={`rounded-t-lg px-3 py-2 ${col.color} border ${col.border} border-b-0`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{col.title}</span>
                  <span className="text-xs font-mono opacity-80">{buckets[col.key].length}</span>
                </div>
                <p className="text-[10px] opacity-70">{col.helper}</p>
              </div>
              <div className={`flex-1 border ${col.border} border-t-0 rounded-b-lg bg-[var(--card-bg)]/30 p-2 space-y-2 min-h-[180px] max-h-[70vh] overflow-y-auto`}>
                {buckets[col.key].length === 0 && (
                  <p className="text-xs text-[var(--muted)] text-center py-6">Arrastrá un lead acá</p>
                )}
                {buckets[col.key].map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); setDraggedId(lead.id); }}
                    onDragEnd={() => setDraggedId(null)}
                    className={`bg-[#0d0d0f] border border-[var(--card-border)] rounded-lg p-3 cursor-grab active:cursor-grabbing ${draggedId === lead.id ? "opacity-40" : ""} ${savingId === lead.id ? "ring-1 ring-[var(--purple)]/60" : ""}`}
                  >
                    <p className="font-semibold text-sm truncate">{lead.nombre || "Sin nombre"}</p>
                    {lead.programa_pitcheado && (
                      <p className="text-[10px] text-[var(--muted)] mt-1">{lead.programa_pitcheado}</p>
                    )}
                    {(col.key === "cerrado_perdido") && lead.ticket_total && lead.ticket_total > 0 && (
                      <p className="text-xs text-green-400 font-medium mt-1">💰 ${lead.ticket_total.toLocaleString()}</p>
                    )}
                    {lead.fecha_agendado && lead.fecha_agendado !== lead.fecha_llamada && (
                      <p className="text-[10px] text-[var(--muted)] mt-1">Agendada: {lead.fecha_agendado.slice(0, 16).replace("T", " ")}</p>
                    )}

                    {/* Quick actions según columna */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {col.key === "por_llamar" && (
                        <>
                          <button
                            onClick={() => marcarShow(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300"
                          >✅ Se presentó</button>
                          <button
                            onClick={() => setPerdiendo(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300"
                          >❌ No vino</button>
                        </>
                      )}
                      {col.key === "show" && (
                        <>
                          <button
                            onClick={() => setCerrando(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-300"
                          >💰 Cerró</button>
                          <button
                            onClick={() => marcarSeguimiento(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-300"
                          >⏰ Seguimiento</button>
                          <button
                            onClick={() => setPerdiendo(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300"
                          >❌ No cierre</button>
                        </>
                      )}
                      {col.key === "seguimiento" && (
                        <>
                          <button
                            onClick={() => setCerrando(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-300"
                          >💰 Cerró</button>
                          <button
                            onClick={() => setPerdiendo(lead)}
                            className="text-[10px] px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300"
                          >❌ Perdido</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {cerrando && (
        <ModalCerrar
          lead={cerrando}
          onClose={() => setCerrando(null)}
          onSave={(body) => applyCerrar(cerrando, body)}
        />
      )}
      {perdiendo && (
        <ModalPerder
          lead={perdiendo}
          onClose={() => setPerdiendo(null)}
          onSave={(motivo, estado) => applyPerder(perdiendo, motivo, estado)}
        />
      )}
    </div>
  );
}

/* ─────────── Modal mini: cerrar ─────────── */

function ModalCerrar({ lead, onClose, onSave }: { lead: Lead; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [ticket, setTicket] = useState<string>(lead.ticket_total ? String(lead.ticket_total) : "");
  const [monto, setMonto] = useState<string>("");
  const [plan, setPlan] = useState<string>(lead.plan_pago || "paid_in_full");
  const [programa, setPrograma] = useState<string>(lead.programa_pitcheado || "omnipresencia");
  const [receptor, setReceptor] = useState<string>("JUANMA");
  const [cuotas, setCuotas] = useState<{ monto: string; fecha: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const nCuotas = plan === "2_cuotas" ? 1 : plan === "3_cuotas" ? 2 : 0;
  // Mantener arreglo de cuotas según plan
  if (cuotas.length !== nCuotas) {
    const next = [...cuotas];
    while (next.length < nCuotas) next.push({ monto: "", fecha: "" });
    while (next.length > nCuotas) next.pop();
    if (next.length !== cuotas.length) setCuotas(next);
  }

  function handleSave() {
    setSaving(true);
    const body: Record<string, unknown> = {
      estado: "cerrado",
      se_presento: lead.se_presento || "si",
      cerrado_en_llamada: true,
      ticket_total: Number(ticket),
      plan_pago: plan,
      programa_pitcheado: programa,
      payment: {
        monto_usd: Number(monto),
        receptor,
        fecha_pago: new Date().toISOString().slice(0, 10),
      },
    };
    if (cuotas.length > 0) {
      body.cuotas = cuotas
        .filter((c) => c.fecha)
        .map((c, i) => ({
          numero_cuota: i + 2,
          monto_usd: Number(c.monto) || 0,
          fecha_vencimiento: c.fecha,
        }));
    }
    onSave(body);
  }

  const input = "w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0d0d0f] border border-[var(--card-border)] rounded-xl max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold">💰 Cerrar — {lead.nombre}</h3>
            <p className="text-xs text-[var(--muted)]">Datos mínimos para registrar el cierre</p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">×</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[var(--muted)]">Programa</label>
            <select value={programa} onChange={(e) => setPrograma(e.target.value)} className={input}>
              <option value="omnipresencia">Omnipresencia</option>
              <option value="consultoria">Consultoría</option>
              <option value="multicuentas">Multicuentas</option>
              <option value="roms_7">ROMS 7</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Ticket USD</label>
            <input type="number" className={input} value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="25000" />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={input}>
              <option value="paid_in_full">PIF (1 pago)</option>
              <option value="2_cuotas">2 cuotas</option>
              <option value="3_cuotas">3 cuotas</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">Monto cobrado HOY</label>
            <input type="number" className={input} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="ej 15000" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[var(--muted)]">Receptor</label>
            <select value={receptor} onChange={(e) => setReceptor(e.target.value)} className={input}>
              <option value="JUANMA">JUANMA</option>
              <option value="FRAN">FRAN</option>
              <option value="VALEN">VALEN</option>
              <option value="otro">Otro (editar después)</option>
            </select>
          </div>
        </div>
        {nCuotas > 0 && (
          <div className="space-y-2 pt-2 border-t border-[var(--card-border)]">
            <p className="text-xs font-semibold text-[var(--muted)]">Cuotas futuras</p>
            {cuotas.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input type="number" placeholder={`Cuota ${i + 2} USD`} className={input} value={c.monto} onChange={(e) => { const n = [...cuotas]; n[i] = { ...n[i], monto: e.target.value }; setCuotas(n); }} />
                <input type="date" className={input} value={c.fecha} onChange={(e) => { const n = [...cuotas]; n[i] = { ...n[i], fecha: e.target.value }; setCuotas(n); }} />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2 border-t border-[var(--card-border)]">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded-lg border border-[var(--card-border)] text-[var(--muted)] hover:text-white">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !ticket || !monto} className="px-4 py-2 text-sm rounded-lg bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 disabled:opacity-50">{saving ? "Guardando..." : "✅ Cerrar deal"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Modal mini: perder ─────────── */

function ModalPerder({ lead, onClose, onSave }: { lead: Lead; onClose: () => void; onSave: (motivo: string, estado: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState<string>("no_cierre");
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0d0d0f] border border-[var(--card-border)] rounded-xl max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold">❌ Perdido — {lead.nombre}</h3>
            <p className="text-xs text-[var(--muted)]">Marcá motivo en 1 línea</p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">×</button>
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]">
          <option value="no_cierre">No cerró (vino pero no cerró)</option>
          <option value="no_show">No show (no vino)</option>
          <option value="cancelada">Canceló</option>
          <option value="no_calificado">No calificó</option>
          <option value="broke_cancelado">No tenía plata</option>
        </select>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional) — ej. presupuesto, mal momento, etc."
          className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
        />
        <div className="flex gap-2 justify-end pt-2 border-t border-[var(--card-border)]">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--card-border)] text-[var(--muted)] hover:text-white">Cancelar</button>
          <button onClick={() => onSave(motivo, estado)} className="px-4 py-2 text-sm rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30">Guardar</button>
        </div>
      </div>
    </div>
  );
}
