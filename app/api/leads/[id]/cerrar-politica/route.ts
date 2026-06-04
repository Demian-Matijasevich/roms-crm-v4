/**
 * POST /api/leads/[id]/cerrar-politica
 * Handoff completo cuando un lead política se cierra:
 *   - Updates en lead: estado=cerrado, etapa_politica=cerrado, ticket_total,
 *     plan_pago, programa_pitcheado, contexto_closer, nicho=politica.
 *   - Crea payment c#1 pagado con el monto cobrado D1 (si se cargó).
 *   - Si plan de pago es N cuotas, crea N-1 payments pendientes con
 *     fecha_vencimiento mensual a partir de fecha_pago.
 *
 * Body shape: {
 *   ticket_total: number,
 *   plan_pago: "paid_in_full" | "2_cuotas" | "3_cuotas" | "personalizado",
 *   programa_pitcheado: string,
 *   monto_d1?: number,
 *   fecha_pago_d1?: string (YYYY-MM-DD),
 *   metodo_pago?: string,
 *   receptor?: string,
 *   notas_handoff?: string,
 *   whatsapp?: string
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { createNotificationsForPolitica } from "@/lib/notifications";

export const dynamic = "force-dynamic";

interface CerrarBody {
  ticket_total?: number;
  plan_pago?: string;
  programa_pitcheado?: string;
  monto_d1?: number;
  fecha_pago_d1?: string;
  metodo_pago?: string;
  receptor?: string;
  notas_handoff?: string;
  whatsapp?: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as CerrarBody;

  const ticket = Number(body.ticket_total || 0);
  if (ticket <= 0) return NextResponse.json({ error: "ticket_total requerido" }, { status: 400 });

  const sb = createServerClient();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead no encontrado" }, { status: 404 });

  const updates: Record<string, unknown> = {
    nicho: "politica",
    estado: "cerrado",
    etapa_politica: "cerrado",
    ticket_total: ticket,
  };
  if (body.plan_pago) updates.plan_pago = body.plan_pago;
  if (body.programa_pitcheado) updates.programa_pitcheado = body.programa_pitcheado;
  if (body.whatsapp) updates.telefono = body.whatsapp;

  // Acumular contexto_closer con notas handoff
  if (body.notas_handoff) {
    const prev = lead.contexto_closer || "";
    const stamp = `[Handoff ${new Date().toISOString().slice(0, 10)}]`;
    updates.contexto_closer = prev ? `${prev}\n${stamp} ${body.notas_handoff}` : `${stamp} ${body.notas_handoff}`;
  }

  const { error: updErr } = await sb.from("leads").update(updates).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Crear payment c#1 pagado si vino monto
  const created_payments: number[] = [];
  if (body.monto_d1 && Number(body.monto_d1) > 0) {
    const monto_d1 = Number(body.monto_d1);
    const fecha = body.fecha_pago_d1 || new Date().toISOString().slice(0, 10);

    // Chequear que no exista ya un c#1
    const { data: existing } = await sb.from("payments").select("id").eq("lead_id", id).eq("numero_cuota", 1);
    if (!existing || existing.length === 0) {
      const { error: payErr } = await sb.from("payments").insert({
        lead_id: id,
        numero_cuota: 1,
        monto_usd: monto_d1,
        monto_ars: 0,
        estado: "pagado",
        fecha_pago: fecha,
        metodo_pago: body.metodo_pago || null,
        receptor: body.receptor || null,
        es_renovacion: false,
        verificado: false,
      });
      if (payErr) return NextResponse.json({ error: `payment c#1: ${payErr.message}` }, { status: 500 });
      created_payments.push(1);
    }

    // Si plan tiene cuotas, generar pendientes
    const restante = ticket - monto_d1;
    let cuotasExtra = 0;
    if (body.plan_pago === "2_cuotas") cuotasExtra = 1;
    if (body.plan_pago === "3_cuotas") cuotasExtra = 2;

    if (cuotasExtra > 0 && restante > 0) {
      const montoPorCuota = Math.round(restante / cuotasExtra);
      const base = new Date(fecha + "T00:00:00");
      for (let i = 0; i < cuotasExtra; i++) {
        const venc = new Date(base);
        venc.setMonth(base.getMonth() + (i + 1));
        const vencStr = venc.toISOString().slice(0, 10);
        const numCuota = i + 2;

        // No duplicar si ya existe
        const { data: ex } = await sb.from("payments").select("id").eq("lead_id", id).eq("numero_cuota", numCuota);
        if (ex && ex.length > 0) continue;

        await sb.from("payments").insert({
          lead_id: id,
          numero_cuota: numCuota,
          monto_usd: montoPorCuota,
          monto_ars: 0,
          estado: "pendiente",
          fecha_pago: null,
          fecha_vencimiento: vencStr,
          metodo_pago: null,
          receptor: null,
          es_renovacion: false,
          verificado: false,
        });
        created_payments.push(numCuota);
      }
    }
  }

  // Notif al equipo política (excluye actor) — handoff a Hugo / cobranzas / etc.
  const cashStr = body.monto_d1 ? ` · cobrado D1 $${body.monto_d1}` : "";
  await createNotificationsForPolitica({
    tipo: "venta",
    titulo: `🎯 Cierre: ${lead.nombre || "Lead"} · ${ticket} USD`,
    mensaje: `${auth.session.nombre} cerró el deal${cashStr}. Revisar handoff para arrancar onboarding.`,
    link: `/pipeline?lead=${id}`,
    meta: { lead_id: id, ticket, actor: auth.session.nombre, payments: created_payments },
  }, { excludeNombres: [auth.session.nombre] });

  return NextResponse.json({ ok: true, lead_id: id, created_payments });
}
