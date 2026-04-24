import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/unify-leads
 * Body: { keep_id: string, merge_ids: string[] }
 *
 * 1. Mueve todos los pagos de los leads a mergear al keeper.
 * 2. Si el keeper tiene campos null pero los mergeados tienen valor, copia (preserva la data).
 * 3. Borra los leads mergeados.
 * 4. Re-sincroniza el keeper al Sheet.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { keep_id, merge_ids } = body;
    if (!keep_id || !Array.isArray(merge_ids) || merge_ids.length === 0) {
      return NextResponse.json({ error: "keep_id y merge_ids requeridos" }, { status: 400 });
    }
    if (merge_ids.includes(keep_id)) {
      return NextResponse.json({ error: "keep_id no puede estar en merge_ids" }, { status: 400 });
    }

    const sb = createServerClient();

    // Fetch keeper + to-merge
    const { data: keeper } = await sb.from("leads").select("*").eq("id", keep_id).maybeSingle();
    if (!keeper) return NextResponse.json({ error: "keeper no encontrado" }, { status: 404 });

    const { data: toMerge } = await sb.from("leads").select("*").in("id", merge_ids);
    if (!toMerge || toMerge.length === 0) return NextResponse.json({ error: "ningún lead para mergear encontrado" }, { status: 404 });

    // Preserve keeper data — fill in nulls from mergeable leads
    const fieldsToFill = ["instagram", "email", "telefono", "setter_id", "closer_id", "utm_source", "utm_medium", "utm_content", "fuente", "fecha_agendado", "fecha_llamada", "programa_pitcheado", "notas_internas", "reporte_general", "contexto_setter"];
    const patch: Record<string, unknown> = {};
    for (const field of fieldsToFill) {
      if (keeper[field] == null || keeper[field] === "") {
        for (const m of toMerge) {
          if (m[field] != null && m[field] !== "") {
            patch[field] = m[field];
            break;
          }
        }
      }
    }
    // ticket_total: use max
    const maxTicket = Math.max(keeper.ticket_total || 0, ...toMerge.map((m) => m.ticket_total || 0));
    if (maxTicket > (keeper.ticket_total || 0)) patch.ticket_total = maxTicket;

    if (Object.keys(patch).length > 0) {
      await sb.from("leads").update(patch).eq("id", keep_id);
    }

    // Move payments from mergeable leads to keeper
    const { count: movedPayments } = await sb
      .from("payments")
      .update({ lead_id: keep_id }, { count: "exact" })
      .in("lead_id", merge_ids);

    // Delete mergeable leads
    const { error: delErr } = await sb.from("leads").delete().in("id", merge_ids);
    if (delErr) return NextResponse.json({ error: "Error al borrar duplicados: " + delErr.message }, { status: 500 });

    // Resync keeper to Sheet
    const syncRes = await syncLeadToSheet(keep_id);

    return NextResponse.json({
      ok: true,
      kept: keep_id,
      merged_count: toMerge.length,
      fields_copied: Object.keys(patch),
      payments_moved: movedPayments || 0,
      sheet_sync: syncRes,
    });
  } catch (err) {
    console.error("[POST /api/admin/unify-leads]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
