import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { upsertLeadToSheet } from "@/lib/sheets-write";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/**
 * Syncs all leads with activity in the given month range to the Sheet.
 * Activity = fecha_llamada, fecha_agendado, or has payment with fecha_pago in range.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = url.searchParams.get("from") || "2026-04-01";
  const to = url.searchParams.get("to") || "2026-04-30";

  const sb = createServerClient();

  // Fetch leads with activity in range
  const { data: leadsByLlamada } = await sb
    .from("leads")
    .select("id, sheets_row_index, nombre, instagram, email, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, fuente, closer_id, setter_id")
    .gte("fecha_llamada", from)
    .lte("fecha_llamada", to)
    .range(0, 4999);

  const { data: leadsByAgenda } = await sb
    .from("leads")
    .select("id, sheets_row_index, nombre, instagram, email, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, fuente, closer_id, setter_id")
    .gte("fecha_agendado", from)
    .lte("fecha_agendado", to)
    .range(0, 4999);

  const { data: payments } = await sb
    .from("payments")
    .select("lead_id")
    .eq("estado", "pagado")
    .gte("fecha_pago", from)
    .lte("fecha_pago", to)
    .range(0, 4999);

  const leadIdsWithPay = new Set((payments || []).map((p) => p.lead_id).filter(Boolean));
  const { data: leadsByPay } = leadIdsWithPay.size > 0
    ? await sb
        .from("leads")
        .select("id, sheets_row_index, nombre, instagram, email, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, fuente, closer_id, setter_id")
        .in("id", Array.from(leadIdsWithPay))
    : { data: [] };

  // Merge unique
  const allLeads = [...(leadsByLlamada || []), ...(leadsByAgenda || []), ...(leadsByPay || [])];
  const unique = Array.from(new Map(allLeads.map((l) => [l.id, l])).values());

  // Fetch team_members for closer/setter names
  const memberIds = Array.from(
    new Set(
      unique
        .flatMap((l) => [l.closer_id, l.setter_id])
        .filter((x): x is string => !!x)
    )
  );
  const { data: members } = memberIds.length > 0
    ? await sb.from("team_members").select("id, nombre").in("id", memberIds)
    : { data: [] };
  const memberMap = new Map((members || []).map((m) => [m.id, m.nombre]));

  // Fetch 1st payment receptor per lead (for Sheet col AS)
  const { data: allPays } = await sb
    .from("payments")
    .select("lead_id, receptor, numero_cuota, fecha_pago")
    .eq("estado", "pagado")
    .in("lead_id", unique.map((l) => l.id))
    .order("numero_cuota");
  const receptorMap: Record<string, string | null> = {};
  for (const p of allPays || []) {
    if (p.lead_id && !receptorMap[p.lead_id]) receptorMap[p.lead_id] = p.receptor;
  }

  const results: Array<Record<string, unknown>> = [];
  let updated = 0, created = 0, failed = 0;

  for (const lead of unique) {
    try {
      const row = await upsertLeadToSheet({
        id: lead.id,
        sheets_row_index: lead.sheets_row_index,
        nombre: lead.nombre,
        instagram: lead.instagram,
        email: lead.email,
        telefono: lead.telefono,
        fecha_llamada: lead.fecha_llamada,
        fecha_agendado: lead.fecha_agendado,
        estado: lead.estado,
        programa_pitcheado: lead.programa_pitcheado,
        ticket_total: lead.ticket_total || 0,
        fuente: lead.fuente,
        closer_nombre: lead.closer_id ? memberMap.get(lead.closer_id) || null : null,
        setter_nombre: lead.setter_id ? memberMap.get(lead.setter_id) || null : null,
        receptor: receptorMap[lead.id] || null,
      });
      if (row && !lead.sheets_row_index) {
        await sb.from("leads").update({ sheets_row_index: row }).eq("id", lead.id);
        created++;
      } else if (row) {
        updated++;
      } else {
        failed++;
      }
      results.push({ nombre: lead.nombre, sheetRow: row, action: lead.sheets_row_index ? "updated" : "appended" });
    } catch (err) {
      failed++;
      results.push({ nombre: lead.nombre, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    from,
    to,
    total_leads: unique.length,
    created,
    updated,
    failed,
    results,
  });
}
