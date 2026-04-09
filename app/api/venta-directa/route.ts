import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ventaChatSchema } from "@/lib/schemas";
import { createLead } from "@/lib/queries/leads";
import { createPayment } from "@/lib/queries/payments";
import { getToday, toDateString } from "@/lib/date-utils";
import type { LeadEstado, LeadFuente, MetodoPago, PlanPago, Programa } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const parsed = ventaChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      nombre,
      instagram,
      telefono,
      email,
      programa_pitcheado,
      ticket_total,
      plan_pago,
      monto_usd,
      metodo_pago,
      receptor,
      setter_id,
    } = parsed.data;

    // Create lead with estado=cerrado, fuente=dm_directo
    const lead = await createLead({
      nombre,
      email: email || null,
      telefono: telefono || null,
      instagram: instagram || null,
      fuente: "dm_directo" as LeadFuente,
      utm_source: null,
      utm_medium: null,
      utm_content: null,
      evento_calendly: null,
      calendly_event_id: null,
      fecha_agendado: null,
      fecha_llamada: getToday().toISOString(),
      estado: "cerrado" as LeadEstado,
      setter_id: setter_id,
      closer_id: null,
      cobrador_id: null,
      contexto_setter: (body.contexto as string) || null,
      reporte_general: null,
      notas_internas: null,
      experiencia_ecommerce: null,
      seguridad_inversion: null,
      tipo_productos: null,
      compromiso_asistencia: null,
      dispuesto_invertir: null,
      decisor: null,
      lead_calificado: null,
      lead_score: null,
      link_llamada: null,
      programa_pitcheado: programa_pitcheado as Programa,
      concepto: plan_pago === "paid_in_full" ? "pif" : "primera_cuota",
      plan_pago: plan_pago as PlanPago,
      ticket_total,
      fue_seguimiento: false,
      de_donde_viene_lead: null,
      sheets_row_index: null,
    });

    if (!lead) {
      return NextResponse.json({ error: "Error al crear lead" }, { status: 500 });
    }

    // Create first payment
    const payment = await createPayment({
      lead_id: lead.id,
      client_id: null,
      renewal_id: null,
      numero_cuota: 1,
      monto_usd,
      monto_ars: 0,
      fecha_pago: (body.fecha as string) || toDateString(getToday()),
      fecha_vencimiento: null,
      estado: "pagado",
      metodo_pago: (metodo_pago as MetodoPago) || null,
      receptor: receptor || null,
      comprobante_url: null,
      cobrador_id: null,
      verificado: false,
      es_renovacion: false,
    });

    if (!payment) {
      return NextResponse.json({ error: "Lead creado pero error al crear pago" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lead, payment });
  } catch (err) {
    console.error("[POST /api/venta-directa]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
