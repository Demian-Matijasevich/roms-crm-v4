import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { cobranzasLogSchema } from "@/lib/schemas";
import { createAgentLogEntry } from "@/lib/queries/agent-tasks";

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const parsed = cobranzasLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { task_id, accion, author_id, mensaje_enviado } = parsed.data;

    // If there's a task_id, log against the task
    if (task_id) {
      const entry = await createAgentLogEntry({
        task_id,
        accion: `[${auth.session.nombre}] ${accion}`,
        mensaje_enviado: mensaje_enviado ?? null,
        respuesta_recibida: null,
        resultado: null,
      });
      return NextResponse.json(entry);
    }

    // If no task_id, return success (notes without tasks handled elsewhere)
    return NextResponse.json({ success: true, message: "Nota registrada" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
