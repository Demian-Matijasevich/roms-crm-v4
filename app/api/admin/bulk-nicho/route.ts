import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/bulk-nicho
 *
 * Body: { nicho: "general" | "politica" | "otro", filter: { lead_ids?: string[], nombres?: string[], telefonos?: string[] } }
 *
 * Marca varios leads con un nicho dado. Soporta 3 modos:
 *   - lead_ids: lista directa de UUIDs
 *   - nombres: busca por nombre (ilike)
 *   - telefonos: busca por telefono
 *
 * Reporta cuántos matchearon y cuántos se actualizaron.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const nicho = String(body?.nicho || "").trim();
    if (!["general", "politica", "otro"].includes(nicho)) {
      return NextResponse.json({ error: "nicho invalido (general/politica/otro)" }, { status: 400 });
    }
    const filter = body?.filter || {};
    const sb = createServerClient();
    const matchedIds = new Set<string>();
    const report: Array<{ input: string; matches: number }> = [];

    if (Array.isArray(filter.lead_ids)) {
      for (const id of filter.lead_ids) {
        matchedIds.add(String(id));
        report.push({ input: String(id), matches: 1 });
      }
    }

    if (Array.isArray(filter.nombres)) {
      for (const raw of filter.nombres) {
        const nombre = String(raw || "").trim();
        if (!nombre) continue;
        const { data } = await sb.from("leads").select("id, nombre").ilike("nombre", `%${nombre}%`);
        const ids = (data || []).map((l: { id: string }) => l.id);
        ids.forEach((id) => matchedIds.add(id));
        report.push({ input: nombre, matches: ids.length });
      }
    }

    if (Array.isArray(filter.telefonos)) {
      for (const raw of filter.telefonos) {
        const tel = String(raw || "").trim().replace(/\D/g, "");
        if (!tel) continue;
        const { data } = await sb.from("leads").select("id, telefono").ilike("telefono", `%${tel}%`);
        const ids = (data || []).map((l: { id: string }) => l.id);
        ids.forEach((id) => matchedIds.add(id));
        report.push({ input: tel, matches: ids.length });
      }
    }

    if (matchedIds.size === 0) {
      return NextResponse.json({ ok: true, updated: 0, report, msg: "Sin matches" });
    }

    const { error } = await sb.from("leads").update({ nicho }).in("id", [...matchedIds]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, updated: matchedIds.size, report });
  } catch (err) {
    console.error("[POST /api/admin/bulk-nicho]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
