import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/auth";
import { reporteSetterSchema } from "@/lib/schemas";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const parsed = reporteSetterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("daily_reports")
      .insert({
        setter_id: parsed.data.setter_id,
        fecha: parsed.data.fecha,
        conversaciones_iniciadas: parsed.data.conversaciones_iniciadas,
        respuestas_historias: parsed.data.respuestas_historias,
        calendarios_enviados: parsed.data.calendarios_enviados,
        ventas_por_chat: parsed.data.ventas_por_chat || null,
        agendas_confirmadas: parsed.data.agendas_confirmadas || null,
        origen_principal: parsed.data.origen_principal,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/reporte-setter]", error.message);
      return NextResponse.json({ error: "Error al guardar reporte" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, report: data });
  } catch (err) {
    console.error("[POST /api/reporte-setter]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const allowed = ["setter_id", "fecha", "conversaciones_iniciadas", "respuestas_historias", "calendarios_enviados", "ventas_por_chat", "agendas_confirmadas"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nada para actualizar" }, { status: 400 });
    const sb = createServerClient();
    const { data, error } = await sb.from("daily_reports").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, report: data });
  } catch (err) {
    console.error("[PATCH /api/reporte-setter]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const sb = createServerClient();
    const { error } = await sb.from("daily_reports").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/reporte-setter]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
