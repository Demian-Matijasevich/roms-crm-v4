import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();

  // April payments pagados
  const { data: pays } = await sb
    .from("payments")
    .select("monto_usd, lead_id")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30");

  const totalCash = (pays || []).reduce((s, p) => s + p.monto_usd, 0);
  const uniqueLeads = new Set((pays || []).map(p => p.lead_id)).size;

  // April cerradas (fecha_llamada)
  const { data: cerradas } = await sb
    .from("leads")
    .select("id, nombre, estado, closer_id, ticket_total")
    .gte("fecha_llamada", "2026-04-01")
    .lte("fecha_llamada", "2026-04-30")
    .in("estado", ["cerrado", "adentro_seguimiento"]);

  // Team
  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter, activo").order("nombre");

  // By closer - April
  const closerAgg: Record<string, { cash: number; leads: Set<string>; cerradas: number; name: string }> = {};
  for (const t of team || []) {
    if (t.is_closer) closerAgg[t.id] = { cash: 0, leads: new Set(), cerradas: 0, name: t.nombre };
  }
  const leadCloserMap: Record<string, string> = {};
  const { data: allLeads } = await sb.from("leads").select("id, closer_id").range(0, 4999);
  for (const l of allLeads || []) if (l.closer_id) leadCloserMap[l.id] = l.closer_id;

  for (const p of pays || []) {
    if (!p.lead_id) continue;
    const cid = leadCloserMap[p.lead_id];
    if (!cid || !closerAgg[cid]) continue;
    closerAgg[cid].cash += p.monto_usd;
    closerAgg[cid].leads.add(p.lead_id);
  }
  for (const c of cerradas || []) {
    if (!c.closer_id || !closerAgg[c.closer_id]) continue;
    closerAgg[c.closer_id].cerradas++;
  }

  const closerSummary = Object.values(closerAgg)
    .map(c => ({ nombre: c.name, cerradas_abril: c.cerradas, cash_cobrado_abril: c.cash, leads_con_cobro: c.leads.size }))
    .sort((a, b) => b.cash_cobrado_abril - a.cash_cobrado_abril);

  return NextResponse.json({
    abril_2026: {
      total_cash: totalCash,
      unique_leads_con_cobro: uniqueLeads,
      payments_count: pays?.length || 0,
      cerradas_count: cerradas?.length || 0,
    },
    by_closer: closerSummary,
  });
}
