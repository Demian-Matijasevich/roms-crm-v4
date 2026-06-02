import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/migrate-leads-to-politica
 * Body: { lead_ids: string[] } o { nombres: string[] }
 *
 * Marca los leads como nicho='politica'. Útil para corregir
 * leads que se cargaron antes de implementar el sistema de nicho.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.lead_ids) ? body.lead_ids : [];
    const nombres: string[] = Array.isArray(body?.nombres) ? body.nombres : [];

    const sb = createServerClient();
    const allIds = new Set<string>(ids);

    for (const nombre of nombres) {
      if (!nombre.trim()) continue;
      const { data } = await sb.from("leads").select("id").ilike("nombre", `%${nombre.trim()}%`);
      for (const l of data || []) allIds.add(l.id);
    }

    if (allIds.size === 0) {
      return NextResponse.json({ ok: true, updated: 0, msg: "Sin matches" });
    }

    const { error } = await sb.from("leads").update({ nicho: "politica" }).in("id", [...allIds]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, updated: allIds.size });
  } catch (err) {
    console.error("[POST /api/admin/migrate-leads-to-politica]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
