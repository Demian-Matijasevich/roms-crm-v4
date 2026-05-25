import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { llamadaSchema, cuotaPendienteSchema } from "@/lib/schemas";
import { updateLead, updateLeadVerbose } from "@/lib/queries/leads";
import { createPayment, createPaymentVerbose } from "@/lib/queries/payments";
import { getToday, toDateString } from "@/lib/date-utils";
import { syncLeadToSheet } from "@/lib/sheet-sync";
import { z } from "zod";
import type { LeadEstado, LeadCalificacion, Programa, MetodoPago } from "@/lib/types";

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

    const { lead_id, estado, programa_pitcheado, concepto, plan_pago, ticket_total, reporte_general, notas_internas, lead_calificado, fecha_cierre_estimada } = parsed.data;

    const paymentMonto = Number((body.payment as { monto_usd?: number } | undefined)?.monto_usd ?? 0);

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
          cobrador_id: null,
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

    // Cuotas futuras pendientes — punto 1 audit Iñaki.
    // Se cargan como pagos pendientes con fecha_vencimiento → alimentan la cola de cobranzas.
    let cuotasCreadas = 0;
    if (isCerrado && Array.isArray(body.cuotas) && body.cuotas.length > 0) {
      const cuotasParsed = z.array(cuotaPendienteSchema).safeParse(body.cuotas);
      if (cuotasParsed.success) {
        for (const c of cuotasParsed.data) {
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

    await syncLeadToSheet(lead_id);
    return NextResponse.json({
      ok: !paymentError,
      lead: updatedLead,
      payment: paymentCreated,
      paymentError,
      cuotasCreadas,
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

    const allowedFields = [
      "estado", "programa_pitcheado", "lead_calificado", "lead_score",
      "ticket_total", "notas_internas", "reporte_general",
      "nombre", "instagram", "email", "telefono",
      "fecha_agendado", "fecha_llamada",
      "closer_id", "setter_id", "cobrador_id",
      "utm_source", "utm_medium", "utm_content",
      "fuente", "concepto", "plan_pago",
      "etiquetas", "fecha_cierre_estimada",
    ];

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

    await syncLeadToSheet(id);
    return NextResponse.json({ ok: true, lead: updateRes.lead });
  } catch (err) {
    console.error("[PATCH /api/llamadas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
