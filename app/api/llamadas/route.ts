import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { llamadaSchema, cuotaPendienteSchema } from "@/lib/schemas";
import { updateLead, updateLeadVerbose } from "@/lib/queries/leads";
import { createPayment, createPaymentVerbose } from "@/lib/queries/payments";
import { createServerClient } from "@/lib/supabase-server";
import { getToday, toDateString } from "@/lib/date-utils";
import { syncLeadToSheetSafe } from "@/lib/sheet-sync";
import { getVista } from "@/lib/vista";
import { z } from "zod";
import type { LeadEstado, LeadCalificacion, Programa, MetodoPago } from "@/lib/types";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function planToCuotas(plan: string | null | undefined): number {
  if (!plan) return 1;
  if (plan === "paid_in_full") return 1;
  if (plan === "2_cuotas") return 2;
  if (plan === "3_cuotas") return 3;
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const parsed = llamadaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { lead_id, estado, programa_pitcheado, concepto, plan_pago, ticket_total, reporte_general, notas_internas, lead_calificado, fecha_cierre_estimada, se_presento, cerrado_en_llamada, transcripcion_url, nicho } = parsed.data;

    const paymentMonto = Number((body.payment as { monto_usd?: number } | undefined)?.monto_usd ?? 0);

    // Detecta si el request viene del form completo de llamada (envía pago/cuotas/plan/etc.)
    // vs un cambio rápido de estado desde el pipeline/panel (solo lead_id+estado+algún campo simple).
    // Las validaciones audit Iñaki solo aplican al form completo — un cambio rápido no las exige.
    const isFromCallForm = Boolean(
      body.payment ||
      body.cuotas ||
      plan_pago ||
      (typeof ticket_total === "number" && ticket_total > 0) ||
      (cerrado_en_llamada !== undefined && cerrado_en_llamada !== null)
    );

    if (isFromCallForm) {
      // ── Validaciones audit Iñaki (server-side) ──
      // P2: estado "cerrado" exige cash cobrado.
      if (estado === "cerrado" && !(paymentMonto > 0)) {
        return NextResponse.json(
          { error: "El estado Cerrado exige cargar el monto cobrado." },
          { status: 400 }
        );
      }
      // P6: una reserva exige fecha estimada de cierre.
      if (estado === "reserva" && !fecha_cierre_estimada) {
        return NextResponse.json(
          { error: "Una reserva exige la fecha estimada de cierre." },
          { status: 400 }
        );
      }
      // 025 — Si el estado implica que se trabajó la llamada, exigir se_presento.
      const ESTADOS_POST_LLAMADA = ["cerrado", "reserva", "seguimiento", "no_cierre", "no_calificado", "adentro_seguimiento"];
      if (ESTADOS_POST_LLAMADA.includes(estado) && !se_presento) {
        return NextResponse.json(
          { error: "Indicá si el lead se presentó a la llamada (¿se presentó?)." },
          { status: 400 }
        );
      }
    }

    // Update the lead
    const leadUpdate: Record<string, unknown> = {
      estado: estado as LeadEstado,
      fecha_llamada: getToday().toISOString(),
    };

    if (programa_pitcheado) leadUpdate.programa_pitcheado = programa_pitcheado;
    if (concepto) leadUpdate.concepto = concepto;
    if (plan_pago) leadUpdate.plan_pago = plan_pago;
    if (ticket_total !== undefined) leadUpdate.ticket_total = ticket_total;
    if (reporte_general) leadUpdate.reporte_general = reporte_general;
    if (notas_internas) leadUpdate.notas_internas = notas_internas;
    if (lead_calificado) leadUpdate.lead_calificado = lead_calificado;
    if (fecha_cierre_estimada) leadUpdate.fecha_cierre_estimada = fecha_cierre_estimada;
    // 025 — Secure Scale improvements
    if (se_presento !== undefined && se_presento !== null) leadUpdate.se_presento = se_presento;
    if (cerrado_en_llamada !== undefined && cerrado_en_llamada !== null) leadUpdate.cerrado_en_llamada = cerrado_en_llamada;
    else if (estado === "cerrado") {
      // Default: si cierra ahora y se presentó, asumimos cerrado en llamada (más común).
      // El form puede destildar esto si fue en seguimiento.
      leadUpdate.cerrado_en_llamada = true;
    }
    if (transcripcion_url) leadUpdate.transcripcion_url = transcripcion_url;
    if (nicho) leadUpdate.nicho = nicho;
    // Si la sesión está en vista política y el form no envió nicho explícito, marcar política.
    else if ((await getVista()) === "politica") leadUpdate.nicho = "politica";

    const updatedLead = await updateLead(lead_id, leadUpdate);
    if (!updatedLead) {
      return NextResponse.json({ error: "Error al actualizar lead" }, { status: 500 });
    }

    // If cerrado/reserva and has payment data, create payment
    const isCerrado = estado === "cerrado" || estado === "reserva" || estado === "adentro_seguimiento";
    let paymentCreated: unknown = null;
    let paymentError: string | null = null;
    if (isCerrado && body.payment) {
      const paymentData = body.payment as {
        monto_usd?: number;
        metodo_pago?: string;
        receptor?: string;
        comprobante_url?: string;
        fecha_pago?: string;
      };

      if (paymentData.monto_usd && paymentData.monto_usd > 0) {
        // Idempotencia: skip si ya existe cuota#1 para este lead (replay/doble click).
        const sbCheck = createServerClient();
        const { data: existingC1 } = await sbCheck
          .from("payments")
          .select("id")
          .eq("lead_id", lead_id)
          .eq("numero_cuota", 1)
          .eq("estado", "pagado")
          .maybeSingle();
        if (existingC1) {
          paymentCreated = existingC1;
        } else {
          const payRes = await createPaymentVerbose({
            lead_id,
            client_id: null,
            renewal_id: null,
            numero_cuota: 1,
            monto_usd: paymentData.monto_usd,
            monto_ars: 0,
            fecha_pago: paymentData.fecha_pago || toDateString(getToday()),
            fecha_vencimiento: null,
            estado: "pagado",
            metodo_pago: (paymentData.metodo_pago as MetodoPago) || null,
            receptor: paymentData.receptor || null,
            comprobante_url: paymentData.comprobante_url || null,
            cobrador_id: result.session.team_member_id,
            verificado: false,
            es_renovacion: false,
          });
          if (payRes.ok) {
            paymentCreated = payRes.payment;
          } else {
            paymentError = `Lead guardado, pero pago falló: ${payRes.error}`;
          }
        }
      }
    }

    // Cuotas futuras pendientes — punto 1 audit Iñaki.
    // Se cargan como pagos pendientes con fecha_vencimiento → alimentan la cola de cobranzas.
    let cuotasCreadas = 0;
    if (isCerrado && Array.isArray(body.cuotas) && body.cuotas.length > 0) {
      const cuotasParsed = z.array(cuotaPendienteSchema).safeParse(body.cuotas);
      if (cuotasParsed.success) {
        // Idempotencia: traer las cuotas ya existentes para skip duplicados.
        const sbCheck = createServerClient();
        const { data: existingCuotas } = await sbCheck
          .from("payments")
          .select("numero_cuota")
          .eq("lead_id", lead_id);
        const yaCargadas = new Set((existingCuotas || []).map((p) => p.numero_cuota));

        for (const c of cuotasParsed.data) {
          if (yaCargadas.has(c.numero_cuota)) continue; // skip si ya existe
          const cuotaRes = await createPaymentVerbose({
            lead_id,
            client_id: null,
            renewal_id: null,
            numero_cuota: c.numero_cuota,
            monto_usd: c.monto_usd,
            monto_ars: 0,
            fecha_pago: null,
            fecha_vencimiento: c.fecha_vencimiento,
            estado: "pendiente",
            metodo_pago: null,
            receptor: null,
            comprobante_url: null,
            cobrador_id: null,
            verificado: false,
            es_renovacion: false,
          });
          if (cuotaRes.ok) cuotasCreadas++;
        }
      }
    }

    // ── Auto-generar cuotas pendientes si el closer NO las cargó a mano ──
    // Se dispara solo si: hubo pago (c1 pagado), plan_pago indica multi-cuotas,
    // ticket_total > 0, y no se cargaron cuotas manualmente.
    let cuotasAutoGeneradas = 0;
    if (
      isCerrado &&
      paymentCreated &&
      cuotasCreadas === 0 &&
      plan_pago &&
      ticket_total &&
      paymentMonto > 0
    ) {
      const totalCuotas = planToCuotas(plan_pago);
      if (totalCuotas > 1) {
        const sb = createServerClient();
        const { data: existing } = await sb
          .from("payments")
          .select("numero_cuota")
          .eq("lead_id", lead_id);
        const yaCargadas = new Set((existing || []).map((p) => p.numero_cuota));

        const restante = Math.max(0, Number(ticket_total) - Number(paymentMonto));
        const montoPorCuota = totalCuotas > 1 ? Math.round(restante / (totalCuotas - 1)) : 0;
        const baseFecha = (body.payment as { fecha_pago?: string } | undefined)?.fecha_pago || toDateString(getToday());

        const aCrear: Array<Record<string, unknown>> = [];
        for (let n = 2; n <= totalCuotas; n++) {
          if (yaCargadas.has(n)) continue;
          aCrear.push({
            lead_id,
            client_id: null,
            numero_cuota: n,
            monto_usd: montoPorCuota,
            monto_ars: 0,
            fecha_pago: null,
            fecha_vencimiento: addDays(baseFecha, 30 * (n - 1)),
            estado: "pendiente",
            verificado: false,
            es_renovacion: false,
          });
        }
        if (aCrear.length > 0) {
          const { error: insErr } = await sb.from("payments").insert(aCrear);
          if (!insErr) cuotasAutoGeneradas = aCrear.length;
        }
      }
    }

    await syncLeadToSheetSafe(lead_id);
    return NextResponse.json({
      ok: !paymentError,
      lead: updatedLead,
      payment: paymentCreated,
      paymentError,
      cuotasCreadas,
      cuotasAutoGeneradas,
    });
  } catch (err) {
    console.error("[POST /api/llamadas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const { id, ...rest } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Se requiere id del lead" }, { status: 400 });
    }

    // Campos editables por todos (gente del equipo)
    const baseFields = [
      "estado", "programa_pitcheado", "lead_calificado", "lead_score",
      "ticket_total", "notas_internas", "reporte_general",
      "nombre", "instagram", "email", "telefono",
      "fecha_agendado", "fecha_llamada",
      "utm_source", "utm_medium", "utm_content",
      "fuente", "concepto", "plan_pago",
      "etiquetas", "fecha_cierre_estimada",
    ];
    // Campos solo modificables por admin (asignaciones)
    const adminOnlyFields = ["closer_id", "setter_id", "cobrador_id"];
    const allowedFields = result.session.is_admin
      ? [...baseFields, ...adminOnlyFields]
      : baseFields;

    const updates: Record<string, unknown> = {};
    for (const k of allowedFields) {
      if (k in rest) {
        if (k === "ticket_total") updates[k] = rest[k] !== null ? Number(rest[k]) : null;
        else if (k === "estado") updates[k] = rest[k] as LeadEstado;
        else if (k === "programa_pitcheado") updates[k] = rest[k] as Programa;
        else if (k === "lead_calificado") updates[k] = rest[k] as LeadCalificacion;
        else updates[k] = rest[k];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updateRes = await updateLeadVerbose(id, updates);
    if (!updateRes.ok) {
      return NextResponse.json({ error: updateRes.error || "Error al actualizar lead" }, { status: 500 });
    }

    await syncLeadToSheetSafe(id);
    return NextResponse.json({ ok: true, lead: updateRes.lead });
  } catch (err) {
    console.error("[PATCH /api/llamadas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
