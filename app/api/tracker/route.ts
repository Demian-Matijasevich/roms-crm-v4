import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { sessionSchema } from "@/lib/schemas";
import { createSession, updateSession } from "@/lib/queries/tracker";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const parsed = sessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const session = await createSession({
      ...parsed.data,
      assignee_id: parsed.data.assignee_id ?? null,
      enlace_llamada: parsed.data.enlace_llamada ?? null,
      notas_setup: parsed.data.notas_setup ?? null,
      rating: parsed.data.rating ?? null,
      aprendizaje_principal: parsed.data.aprendizaje_principal ?? null,
      feedback_cliente: parsed.data.feedback_cliente ?? null,
      herramienta_mas_util: parsed.data.herramienta_mas_util ?? null,
      follow_up_date: parsed.data.follow_up_date ?? null,
    } as Parameters<typeof createSession>[0]);

    if (!session) {
      return NextResponse.json({ error: "Error creando sesion" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session });
  } catch (err) {
    console.error("[POST /api/tracker]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const { id, ...fields } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const parsed = sessionSchema.partial().safeParse(fields);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const session = await updateSession(id, parsed.data as Parameters<typeof updateSession>[1]);
    if (!session) {
      return NextResponse.json({ error: "Sesion no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, session });
  } catch (err) {
    console.error("[PATCH /api/tracker]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
