import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/leads
 * Body: { id: string, setter_id?: string | null, closer_id?: string | null, cobrador_id?: string | null }
 * Admin-only.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = ["setter_id", "closer_id", "cobrador_id", "estado", "utm_source", "utm_medium", "utm_content"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nada para actualizar" }, { status: 400 });

    const sb = createServerClient();
    const { data, error } = await sb.from("leads").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Resync al Sheet si se cambia algo que afecta la fila
    if (data?.id) await syncLeadToSheet(data.id);

    return NextResponse.json({ ok: true, lead: data });
  } catch (err) {
    console.error("[PATCH /api/leads]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
