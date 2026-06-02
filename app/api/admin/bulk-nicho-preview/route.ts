import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/bulk-nicho-preview
 * Body: { filter: { lead_ids?, nombres?, telefonos? } }
 *
 * Igual que bulk-nicho pero NO actualiza nada — devuelve los matches.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const filter = body?.filter || {};
    const sb = createServerClient();
    const report: Array<{ input: string; matches: number; matchedNames: string[] }> = [];

    if (Array.isArray(filter.lead_ids)) {
      for (const id of filter.lead_ids) {
        const { data } = await sb.from("leads").select("id, nombre").eq("id", String(id)).maybeSingle();
        report.push({
          input: String(id),
          matches: data ? 1 : 0,
          matchedNames: data ? [data.nombre || ""] : [],
        });
      }
    }
    if (Array.isArray(filter.nombres)) {
      for (const raw of filter.nombres) {
        const nombre = String(raw || "").trim();
        if (!nombre) continue;
        const { data } = await sb.from("leads").select("id, nombre").ilike("nombre", `%${nombre}%`).limit(5);
        report.push({
          input: nombre,
          matches: data?.length || 0,
          matchedNames: (data || []).map((l) => l.nombre || ""),
        });
      }
    }
    if (Array.isArray(filter.telefonos)) {
      for (const raw of filter.telefonos) {
        const tel = String(raw || "").trim().replace(/\D/g, "");
        if (!tel) continue;
        const { data } = await sb.from("leads").select("id, nombre, telefono").ilike("telefono", `%${tel}%`).limit(5);
        report.push({
          input: tel,
          matches: data?.length || 0,
          matchedNames: (data || []).map((l) => l.nombre || ""),
        });
      }
    }

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    console.error("[POST /api/admin/bulk-nicho-preview]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
