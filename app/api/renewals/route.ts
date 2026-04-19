import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const renewalSchema = z.object({
  client_id: z.string().uuid(),
  tipo_renovacion: z.string().min(1),
  programa_anterior: z.string().nullable(),
  programa_nuevo: z.string().nullable(),
  monto_total: z.number().min(0),
  plan_pago: z.string().nullable(),
  estado: z.string().nullable(),
  fecha_renovacion: z.string().nullable(),
  responsable_id: z.string().uuid().nullable(),
});

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const parsed = renewalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("renewal_history")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const allowed = ["tipo_renovacion", "programa_anterior", "programa_nuevo", "monto_total", "plan_pago", "estado", "fecha_renovacion", "responsable_id"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nada para actualizar" }, { status: 400 });
    const sb = createServerClient();
    const { data, error } = await sb.from("renewal_history").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, renewal: data });
  } catch (err) {
    console.error("[PATCH /api/renewals]", err);
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
    const { error } = await sb.from("renewal_history").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/renewals]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
