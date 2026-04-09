import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { clientUpdateSchema } from "@/lib/schemas";
import { updateClient } from "@/lib/queries/clients";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const { id } = await params;
    const body = await req.json();
    const parsed = clientUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const client = await updateClient(id, parsed.data);
    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, client });
  } catch (err) {
    console.error("[PATCH /api/clients/:id]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
