import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/coaching/apurar
 * Body: { lead_id, mensaje }
 *
 * Solo admin o jefe_ventas. Agrega una linea a notas_internas del lead
 * con timestamp y autor, para que el closer la vea al abrir el lead.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  if (!session.is_admin && !session.is_jefe_ventas) {
    return NextResponse.json({ error: "Solo admin o jefe de ventas" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const leadId = body?.lead_id;
    const mensaje = String(body?.mensaje || "").trim();
    if (!leadId || !mensaje) {
      return NextResponse.json({ error: "lead_id y mensaje requeridos" }, { status: 400 });
    }

    const sb = createServerClient();
    const { data: lead } = await sb.from("leads").select("notas_internas").eq("id", leadId).maybeSingle();
    const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const apure = `[APURE · ${session.nombre} · ${fecha}] ${mensaje}`;
    const newNotas = lead?.notas_internas ? `${apure}\n\n${lead.notas_internas}` : apure;

    const { error } = await sb.from("leads").update({ notas_internas: newNotas }).eq("id", leadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/coaching/apurar]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
