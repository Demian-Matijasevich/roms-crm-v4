import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

const COPY_FIELDS = [
  "instagram", "email", "telefono", "setter_id", "closer_id", "cobrador_id",
  "utm_source", "utm_medium", "utm_content", "fuente",
  "fecha_agendado", "fecha_llamada", "programa_pitcheado", "concepto", "plan_pago",
  "notas_internas", "reporte_general", "contexto_setter", "lead_calificado",
  "lead_score", "sheets_row_index",
];

/**
 * POST /api/admin/merge-by-name
 * Body: { plans: [{ keepIdPrefix: string, mergeIdPrefixes: string[] }, ...] }
 * Resuelve los IDs por prefijo (8 chars), valida unicidad, ejecuta fusiones.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const plans = body.plans as Array<{ keepIdPrefix: string; mergeIdPrefixes: string[] }>;
  if (!Array.isArray(plans)) return NextResponse.json({ error: "plans array requerido" }, { status: 400 });

  const sb = createServerClient();
  const allPrefixes = new Set<string>();
  for (const p of plans) {
    allPrefixes.add(p.keepIdPrefix);
    p.mergeIdPrefixes.forEach(x => allPrefixes.add(x));
  }

  // Resolve prefixes via raw SQL — Supabase REST doesn't support LIKE on uuid, so fetch all + filter
  const { data: leads } = await sb.from("leads").select("id, nombre").range(0, 9999);
  const idByPrefix = new Map<string, string[]>();
  for (const pre of allPrefixes) {
    const matches = (leads || []).filter(l => l.id.startsWith(pre)).map(l => l.id);
    idByPrefix.set(pre, matches);
  }

  // Validate uniqueness
  const errors: string[] = [];
  for (const [pre, ids] of idByPrefix) {
    if (ids.length === 0) errors.push(`prefijo ${pre} no encontrado`);
    if (ids.length > 1) errors.push(`prefijo ${pre} ambiguo (${ids.length} matches)`);
  }
  if (errors.length > 0) return NextResponse.json({ error: "validación falló", details: errors }, { status: 400 });

  const results: unknown[] = [];
  let totalMerged = 0, totalPaymentsMoved = 0;

  for (const plan of plans) {
    const keepId = idByPrefix.get(plan.keepIdPrefix)![0];
    const mergeIds = plan.mergeIdPrefixes.map(p => idByPrefix.get(p)![0]);

    const { data: keeper } = await sb.from("leads").select("*").eq("id", keepId).maybeSingle();
    const { data: mergeables } = await sb.from("leads").select("*").in("id", mergeIds);
    if (!keeper || !mergeables || mergeables.length === 0) {
      results.push({ keepId, error: "datos no encontrados" });
      continue;
    }

    // Fill keeper nulls
    const patch: Record<string, unknown> = {};
    for (const f of COPY_FIELDS) {
      const k = (keeper as Record<string, unknown>)[f];
      if (k == null || k === "") {
        for (const m of mergeables as Record<string, unknown>[]) {
          if (m[f] != null && m[f] !== "") { patch[f] = m[f]; break; }
        }
      }
    }
    const maxTicket = Math.max((keeper as Record<string, unknown>).ticket_total as number || 0, ...mergeables.map(m => (m as Record<string, unknown>).ticket_total as number || 0));
    if (maxTicket > ((keeper as Record<string, unknown>).ticket_total as number || 0)) patch.ticket_total = maxTicket;

    if (Object.keys(patch).length > 0) {
      await sb.from("leads").update(patch).eq("id", keepId);
    }

    // Move payments
    const { count } = await sb.from("payments").update({ lead_id: keepId }, { count: "exact" }).in("lead_id", mergeIds);
    if (count) totalPaymentsMoved += count;

    // Delete mergeables (handle FK error)
    const { error: delErr } = await sb.from("leads").delete().in("id", mergeIds);
    if (delErr) {
      results.push({ keepId, keepName: keeper.nombre, error: delErr.message });
      continue;
    }

    await syncLeadToSheet(keepId).catch(() => null);
    totalMerged += mergeIds.length;
    results.push({ keepId, keepName: keeper.nombre, merged: mergeIds.length });
  }

  return NextResponse.json({ ok: true, total_merged: totalMerged, payments_moved: totalPaymentsMoved, results });
}
