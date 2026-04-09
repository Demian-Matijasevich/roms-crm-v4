import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { followUpSchema } from "@/lib/schemas";
import { createFollowUp } from "@/lib/queries/followups";
import { createServerClient } from "@/lib/supabase-server";
import { getToday, toDateString } from "@/lib/date-utils";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const parsed = followUpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const followUp = await createFollowUp({
      client_id: parsed.data.client_id,
      author_id: result.session.team_member_id,
      fecha: toDateString(getToday()),
      tipo: parsed.data.tipo,
      notas: parsed.data.notas,
      proxima_accion: parsed.data.proxima_accion ?? null,
      proxima_fecha: parsed.data.proxima_fecha ?? null,
    });

    if (!followUp) {
      return NextResponse.json({ error: "Error creando follow-up" }, { status: 500 });
    }

    // Update client's seguimiento dates
    const supabase = createServerClient();
    const updateFields: Record<string, unknown> = {
      fecha_ultimo_seguimiento: toDateString(getToday()),
    };
    if (parsed.data.proxima_fecha) {
      updateFields.fecha_proximo_seguimiento = parsed.data.proxima_fecha;
    }

    await supabase
      .from("clients")
      .update(updateFields)
      .eq("id", parsed.data.client_id);

    return NextResponse.json({ ok: true, followUp });
  } catch (err) {
    console.error("[POST /api/followups]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
