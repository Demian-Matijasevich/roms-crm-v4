import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/cuotas/bulk-move
 * Body: { lead_id, dias (number) }
 *
 * Mueve TODAS las cuotas pendientes del lead +N dias.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    let leadId: string | null = body?.lead_id || null;
    const paymentId = body?.payment_id || null;
    const dias = Number(body?.dias);
    if (!leadId && !paymentId) {
      return NextResponse.json({ error: "lead_id o payment_id requerido" }, { status: 400 });
    }
    if (!Number.isFinite(dias) || dias === 0) {
      return NextResponse.json({ error: "dias debe ser != 0" }, { status: 400 });
    }

    const sb = createServerClient();
    // Si vino payment_id, resolver lead_id desde el payment
    if (!leadId && paymentId) {
      const { data: p } = await sb.from("payments").select("lead_id").eq("id", paymentId).maybeSingle();
      if (!p?.lead_id) return NextResponse.json({ error: "lead no encontrado" }, { status: 404 });
      leadId = p.lead_id;
    }
    const { data: pendientes } = await sb
      .from("payments")
      .select("id, fecha_vencimiento")
      .eq("lead_id", leadId)
      .eq("estado", "pendiente");

    if (!pendientes || pendientes.length === 0) {
      return NextResponse.json({ ok: true, moved: 0 });
    }

    let moved = 0;
    for (const p of pendientes) {
      if (!p.fecha_vencimiento) continue;
      const d = new Date(p.fecha_vencimiento + "T00:00:00");
      d.setDate(d.getDate() + dias);
      const newDate = d.toISOString().slice(0, 10);
      const { error: updErr } = await sb.from("payments").update({ fecha_vencimiento: newDate }).eq("id", p.id);
      if (!updErr) moved++;
    }

    return NextResponse.json({ ok: true, moved });
  } catch (err) {
    console.error("[POST /api/cuotas/bulk-move]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
