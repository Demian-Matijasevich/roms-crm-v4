import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { reporteSetterSchema } from "@/lib/schemas";
import { createServerClient } from "@/lib/supabase-server";

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
