import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { llamadaSchema } from "@/lib/schemas";
import { updateLead } from "@/lib/queries/leads";
import { createPayment } from "@/lib/queries/payments";
import { getToday, toDateString } from "@/lib/date-utils";
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

    const { lead_id, estado, programa_pitcheado, concepto, plan_pago, ticket_total, reporte_general, notas_internas, lead_calificado } = parsed.data;

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

    const updatedLead = await updateLead(lead_id, leadUpdate);
    if (!updatedLead) {
      return NextResponse.json({ error: "Error al actualizar lead" }, { status: 500 });
    }

    // If cerrado/reserva and has payment data, create payment
    const isCerrado = estado === "cerrado" || estado === "reserva";
    if (isCerrado && body.payment) {
      const paymentData = body.payment as {
        monto_usd?: number;
        metodo_pago?: string;
        receptor?: string;
      };

      if (paymentData.monto_usd && paymentData.monto_usd > 0) {
        await createPayment({
          lead_id,
          client_id: null,
          renewal_id: null,
          numero_cuota: 1,
          monto_usd: paymentData.monto_usd,
          monto_ars: 0,
          fecha_pago: toDateString(getToday()),
          fecha_vencimiento: null,
          estado: "pagado",
          metodo_pago: (paymentData.metodo_pago as MetodoPago) || null,
          receptor: paymentData.receptor || null,
          comprobante_url: null,
          cobrador_id: null,
          verificado: false,
          es_renovacion: false,
        });
      }
    }

    return NextResponse.json({ ok: true, lead: updatedLead });
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
    const { id, estado, programa_pitcheado, lead_calificado, ticket_total, notas_internas, reporte_general } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Se requiere id del lead" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (estado !== undefined) updates.estado = estado as LeadEstado;
    if (programa_pitcheado !== undefined) updates.programa_pitcheado = programa_pitcheado as Programa;
    if (lead_calificado !== undefined) updates.lead_calificado = lead_calificado as LeadCalificacion;
    if (ticket_total !== undefined) updates.ticket_total = Number(ticket_total);
    if (notas_internas !== undefined) updates.notas_internas = notas_internas;
    if (reporte_general !== undefined) updates.reporte_general = reporte_general;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    const updatedLead = await updateLead(id, updates);
    if (!updatedLead) {
      return NextResponse.json({ error: "Error al actualizar lead" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lead: updatedLead });
  } catch (err) {
    console.error("[PATCH /api/llamadas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
