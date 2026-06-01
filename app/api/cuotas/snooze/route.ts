import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/cuotas/snooze
 * Body: { payment_id, dias (number, default 7), motivo (string, opcional), fecha_estimada_pago? }
 *
 * Postergar una cuota pendiente. Acumula snooze_count.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const paymentId = body?.payment_id;
    const dias = Number(body?.dias || 7);
    const motivo = String(body?.motivo || "").trim();
    const fechaEstimada = body?.fecha_estimada_pago || null;
    if (!paymentId) return NextResponse.json({ error: "payment_id requerido" }, { status: 400 });

    const sb = createServerClient();
    const { data: payment } = await sb
      .from("payments")
      .select("id, fecha_vencimiento, snoozed_until, snooze_count, estado")
      .eq("id", paymentId)
      .maybeSingle();
    if (!payment) return NextResponse.json({ error: "Payment no existe" }, { status: 404 });
    if (payment.estado !== "pendiente") {
      return NextResponse.json({ error: "Solo se pueden postergar cuotas pendientes" }, { status: 400 });
    }

    const baseDate = payment.snoozed_until || payment.fecha_vencimiento || new Date().toISOString().slice(0, 10);
    const d = new Date(baseDate + "T00:00:00");
    d.setDate(d.getDate() + dias);
    const newSnoozedUntil = d.toISOString().slice(0, 10);

    const { data: updated, error } = await sb
      .from("payments")
      .update({
        snoozed_until: newSnoozedUntil,
        snooze_count: (payment.snooze_count || 0) + 1,
        snooze_motivo: motivo || null,
        fecha_estimada_pago: fechaEstimada || newSnoozedUntil,
      })
      .eq("id", paymentId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, payment: updated });
  } catch (err) {
    console.error("[POST /api/cuotas/snooze]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
