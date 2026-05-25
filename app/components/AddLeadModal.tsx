"use client";

import { useState } from "react";
import { PROGRAMS, LEAD_ESTADOS_LABELS } from "@/lib/constants";

interface TeamMemberLite { id: string; nombre: string; is_closer?: boolean; is_setter?: boolean }

interface Props {
  closers: TeamMemberLite[];
  setters: TeamMemberLite[];
  onClose: () => void;
  onCreated?: (lead: { id: string; nombre: string }) => void;
}

export default function AddLeadModal({ closers, setters, onClose, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [instagram, setInstagram] = useState("");
  const [fuente, setFuente] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [fechaAgendado, setFechaAgendado] = useState("");
  const [fechaLlamada, setFechaLlamada] = useState("");
  const [estado, setEstado] = useState<string>("pendiente");
  const [closerId, setCloserId] = useState("");
  const [setterId, setSetterId] = useState("");
  const [programaPitcheado, setProgramaPitcheado] = useState("");
  const [ticketTotal, setTicketTotal] = useState<string>("");
  const [calificado, setCalificado] = useState("");
  const [planPago, setPlanPago] = useState("");
  const [notas, setNotas] = useState("");
  const [cashUsd, setCashUsd] = useState<string>("");
  const [cashArs, setCashArs] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>("");
  const [numeroCuota, setNumeroCuota] = useState<number>(1);
  const [metodoPago, setMetodoPago] = useState<string>("");
  const [metodoCustom, setMetodoCustom] = useState<string>("");
  const [receptor, setReceptor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const inputClass = "bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white w-full";

  async function handleSave() {
    if (!nombre.trim()) {
      setMsg("Error: nombre requerido");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        nombre: nombre.trim(),
        estado,
      };
      if (email.trim()) body.email = email.trim();
      if (telefono.trim()) body.telefono = telefono.trim();
      if (instagram.trim()) body.instagram = instagram.trim();
      if (fuente.trim()) body.fuente = fuente.trim();
      if (utmSource.trim()) body.utm_source = utmSource.trim();
      if (utmMedium.trim()) body.utm_medium = utmMedium.trim();
      if (utmContent.trim()) body.utm_content = utmContent.trim();
      if (fechaAgendado) body.fecha_agendado = fechaAgendado;
      if (fechaLlamada) body.fecha_llamada = fechaLlamada;
      if (closerId) body.closer_id = closerId;
      if (setterId) body.setter_id = setterId;
      if (programaPitcheado) body.programa_pitcheado = programaPitcheado;
      if (ticketTotal) body.ticket_total = Number(ticketTotal);
      if (calificado) body.lead_calificado = calificado;
      if (planPago) body.plan_pago = planPago;
      if (notas.trim()) body.notas_internas = notas.trim();

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok || !json.lead) {
        setMsg("Error: " + (json.error || "no se pudo crear"));
        return;
      }

      // Si cargó cash collected, crear el pago asociado
      const cashUsdNum = Number(cashUsd) || 0;
      const cashArsNum = Number(cashArs) || 0;
      if (cashUsdNum > 0 || cashArsNum > 0) {
        const finalMetodo = metodoPago === "otro" ? metodoCustom.trim() : metodoPago;
        const payRes = await fetch("/api/pagos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: json.lead.id,
            numero_cuota: numeroCuota,
            monto_usd: cashUsdNum,
            monto_ars: cashArsNum,
            fecha_pago: fechaPago || new Date().toISOString().slice(0, 10),
            estado: "pagado",
            metodo_pago: finalMetodo || undefined,
            receptor: receptor || undefined,
            es_renovacion: false,
          }),
        });
        const payJson = await payRes.json();
        if (!payJson.ok) {
          setMsg("Lead creado pero error en pago: " + (payJson.error || "desconocido"));
          // No retornar — el lead ya se creó
        }
      }

      if (onCreated) onCreated({ id: json.lead.id, nombre: json.lead.nombre });
      onClose();
    } catch (err) {
      setMsg("Error de red: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--card-border)] flex items-center justify-between sticky top-0 bg-[var(--card-bg)] z-10">
          <h2 className="text-lg font-semibold text-white">+ Cargar nuevo lead</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--muted)] hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Contacto *</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Nombre *">
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} autoFocus />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Instagram">
              <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} className={inputClass} placeholder="@usuario" />
            </Field>
          </div>

          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Estado / Asignación</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Estado">
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputClass}>
                {Object.entries(LEAD_ESTADOS_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </Field>
            <Field label="Closer">
              <select value={closerId} onChange={(e) => setCloserId(e.target.value)} className={inputClass}>
                <option value="">Sin closer</option>
                {closers.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
            </Field>
            <Field label="Setter">
              <select value={setterId} onChange={(e) => setSetterId(e.target.value)} className={inputClass}>
                <option value="">Sin setter</option>
                {setters.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
              </select>
            </Field>
            <Field label="Lead calificado">
              <select value={calificado} onChange={(e) => setCalificado(e.target.value)} className={inputClass}>
                <option value="">---</option>
                <option value="calificado">Calificado</option>
                <option value="no_calificado">No calificado</option>
                <option value="podria">Podria</option>
              </select>
            </Field>
          </div>

          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Fechas / Programa</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Fecha agendado">
              <input type="date" value={fechaAgendado} onChange={(e) => setFechaAgendado(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Fecha llamada">
              <input type="date" value={fechaLlamada} onChange={(e) => setFechaLlamada(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Programa pitcheado">
              <select value={programaPitcheado}
                onChange={(e) => {
                  if (e.target.value === "__otro__") {
                    const c = window.prompt("Nuevo programa (slug):");
                    if (c && c.trim()) setProgramaPitcheado(c.trim());
                  } else setProgramaPitcheado(e.target.value);
                }}
                className={inputClass}>
                <option value="">Sin programa</option>
                {Object.entries(PROGRAMS).map(([k, p]) => (<option key={k} value={k}>{p.label}</option>))}
                {programaPitcheado && !PROGRAMS[programaPitcheado] && (
                  <option value={programaPitcheado}>{programaPitcheado}</option>
                )}
                <option value="__otro__">+ Otro (escribir nuevo)</option>
              </select>
            </Field>
            <Field label="Ticket USD">
              <input type="number" value={ticketTotal} onChange={(e) => setTicketTotal(e.target.value)} className={inputClass} min={0} step={100} />
            </Field>
          </div>

          <h3 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider pt-3">Tracking</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Fuente">
              <input type="text" value={fuente} onChange={(e) => setFuente(e.target.value)} className={inputClass} />
            </Field>
            <Field label="UTM source">
              <input type="text" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} className={inputClass} />
            </Field>
            <Field label="UTM medium">
              <input type="text" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} className={inputClass} />
            </Field>
            <Field label="UTM content">
              <input type="text" value={utmContent} onChange={(e) => setUtmContent(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Plan pago">
              <select value={planPago} onChange={(e) => setPlanPago(e.target.value)} className={inputClass}>
                <option value="">---</option>
                <option value="paid_in_full">Paid in full</option>
                <option value="2_cuotas">2 cuotas</option>
                <option value="3_cuotas">3 cuotas</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </Field>
          </div>

          <Field label="Notas internas">
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className={`${inputClass} min-h-[80px] resize-y`} rows={3} />
          </Field>

          <h3 className="text-xs font-semibold uppercase text-[var(--green)] tracking-wider pt-3">💵 Cash collected (opcional)</h3>
          <p className="text-[10px] text-[var(--muted)]">Si el lead pagó algo en esta llamada, cargá los datos del pago acá. Se crea automáticamente como cuota.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Cash USD">
              <input type="number" value={cashUsd} onChange={(e) => setCashUsd(e.target.value)} className={inputClass} min={0} step={50} placeholder="0" />
            </Field>
            <Field label="Cash ARS">
              <input type="number" value={cashArs} onChange={(e) => setCashArs(e.target.value)} className={inputClass} min={0} step={1000} placeholder="0" />
            </Field>
            <Field label="Cuota #">
              <input type="number" value={numeroCuota} onChange={(e) => setNumeroCuota(Number(e.target.value))} className={inputClass} min={1} max={10} />
            </Field>
            <Field label="Fecha pago">
              <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Método de pago">
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className={inputClass}>
                <option value="">---</option>
                <option value="mercado_pago">mercado_pago</option>
                <option value="transferencia">transferencia</option>
                <option value="cash">cash</option>
                <option value="binance">binance</option>
                <option value="stripe">stripe</option>
                <option value="wise">wise</option>
                <option value="otro">+ Otro (escribir)</option>
              </select>
              {metodoPago === "otro" && (
                <input type="text" value={metodoCustom} onChange={(e) => setMetodoCustom(e.target.value)}
                  placeholder="ej: paypal..." className={`${inputClass} mt-2`} />
              )}
            </Field>
            <Field label="Receptor">
              <input type="text" value={receptor} onChange={(e) => setReceptor(e.target.value)} className={inputClass} placeholder="Quién cobró" />
            </Field>
          </div>
        </div>

        <div className="p-5 border-t border-[var(--card-border)] flex items-center gap-3 sticky bottom-0 bg-[var(--card-bg)]">
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-5 py-2 rounded-lg disabled:opacity-50">
            {saving ? "Creando..." : "Crear lead"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[var(--muted)] mb-1 block">{label}</label>
      {children}
    </div>
  );
}
