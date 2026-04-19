import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Fix para leads donde fecha_agendado == fecha_llamada porque el webhook de iClosed
 * seteaba ambas al mismo dateTime.
 *
 * Estrategia segura:
 * - Para leads con estado="pendiente" Y fecha_agendado == fecha_llamada →
 *   nulificar fecha_llamada (la call todavía no ocurrió).
 * - Para estados de no-cierre que típicamente NO implican call tomada
 *   (cancelada, no_show, reprogramada) → nulificar fecha_llamada también.
 * - Para estados de call tomada (cerrado, adentro_seguimiento, seguimiento,
 *   no_cierre, no_calificado) → dejar como está (la fecha representa
 *   aproximadamente cuando se tomó la call).
 *
 * dry=1 para preview sin modificar.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const dryRun = url.searchParams.get("dry") === "1";
  const sb = createServerClient();

  // Leads donde fecha_agendado == fecha_llamada (ambas set)
  const { data: leads, error } = await sb
    .from("leads")
    .select("id, nombre, estado, fecha_agendado, fecha_llamada, sheets_row_index")
    .not("fecha_agendado", "is", null)
    .not("fecha_llamada", "is", null)
    .range(0, 9999);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Estados donde la call NO se tomó (podemos nulificar fecha_llamada)
  const notTakenStates = new Set(["pendiente", "cancelada", "no_show", "reprogramada"]);

  let matched = 0;
  let toFix = 0;
  let leftAlone = 0;
  let updated = 0;
  const sample: Array<{ row: number | null; nombre: string; estado: string; action: string }> = [];

  for (const l of leads || []) {
    const fa = l.fecha_agendado;
    const fl = l.fecha_llamada;
    if (fa !== fl) continue;
    matched++;

    if (notTakenStates.has(l.estado)) {
      toFix++;
      if (!dryRun) {
        const { error: upErr } = await sb.from("leads").update({ fecha_llamada: null }).eq("id", l.id);
        if (!upErr) updated++;
      }
      if (sample.length < 50) sample.push({ row: l.sheets_row_index, nombre: l.nombre, estado: l.estado, action: "nullify_fecha_llamada" });
    } else {
      leftAlone++;
    }
  }

  return NextResponse.json({
    total_leads_con_fechas_iguales: matched,
    to_fix: toFix,
    left_alone: leftAlone,
    actually_updated: updated,
    dry_run: dryRun,
    sample,
  });
}
