import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const desde = url.searchParams.get("desde") || "2026-04-01";
  const hasta = url.searchParams.get("hasta") || "2026-04-30";
  const detail = url.searchParams.get("detail") === "1";

  const sb = createServerClient();

  const { data: pays } = await sb
    .from("payments")
    .select("monto_usd, lead_id")
    .eq("estado", "pagado")
    .gte("fecha_pago", desde)
    .lte("fecha_pago", hasta);

  const totalCash = (pays || []).reduce((s, p) => s + p.monto_usd, 0);
  const uniqueLeads = new Set((pays || []).map(p => p.lead_id)).size;

  const { data: cerradas } = await sb
    .from("leads")
    .select("id, nombre, estado, closer_id, ticket_total, fecha_llamada, fecha_agendado, sheets_row_index, setter_id, utm_source, utm_medium")
    .gte("fecha_llamada", `${desde}T00:00:00`)
    .lte("fecha_llamada", `${hasta}T23:59:59`)
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .order("fecha_llamada");

  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter, activo").order("nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre] as const));

  const closerAgg: Record<string, { cash: number; leads: Set<string>; cerradas: number; name: string; leads_detail: Array<{ nombre: string; estado: string; fecha: string | null; ticket: number; sheet_row: number | null }> }> = {};
  for (const t of team || []) {
    if (t.is_closer) closerAgg[t.id] = { cash: 0, leads: new Set(), cerradas: 0, name: t.nombre, leads_detail: [] };
  }

  const sinCloser: Array<{ id: string; nombre: string; estado: string; fecha: string | null; ticket: number; sheet_row: number | null; setter: string | null; utm_source: string | null; utm_medium: string | null }> = [];

  const leadCloserMap: Record<string, string> = {};
  const { data: allLeads } = await sb.from("leads").select("id, closer_id").range(0, 9999);
  for (const l of allLeads || []) if (l.closer_id) leadCloserMap[l.id] = l.closer_id;

  for (const p of pays || []) {
    if (!p.lead_id) continue;
    const cid = leadCloserMap[p.lead_id];
    if (!cid || !closerAgg[cid]) continue;
    closerAgg[cid].cash += p.monto_usd;
    closerAgg[cid].leads.add(p.lead_id);
  }

  for (const c of cerradas || []) {
    if (!c.closer_id) {
      sinCloser.push({
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        fecha: c.fecha_llamada,
        ticket: c.ticket_total || 0,
        sheet_row: c.sheets_row_index,
        setter: c.setter_id ? teamById.get(c.setter_id) || null : null,
        utm_source: c.utm_source,
        utm_medium: c.utm_medium,
      });
      continue;
    }
    if (!closerAgg[c.closer_id]) continue;
    closerAgg[c.closer_id].cerradas++;
    if (detail) {
      closerAgg[c.closer_id].leads_detail.push({
        nombre: c.nombre,
        estado: c.estado,
        fecha: c.fecha_llamada,
        ticket: c.ticket_total || 0,
        sheet_row: c.sheets_row_index,
      });
    }
  }

  const closerSummary = Object.values(closerAgg)
    .filter(c => c.cash > 0 || c.cerradas > 0)
    .map(c => ({
      nombre: c.name,
      cerradas: c.cerradas,
      cash_cobrado: c.cash,
      leads_con_cobro: c.leads.size,
      ...(detail ? { leads_detail: c.leads_detail } : {}),
    }))
    .sort((a, b) => b.cash_cobrado - a.cash_cobrado);

  return NextResponse.json({
    rango: { desde, hasta },
    total_cash: totalCash,
    unique_leads_con_cobro: uniqueLeads,
    payments_count: pays?.length || 0,
    cerradas_count: cerradas?.length || 0,
    by_closer: closerSummary,
    sin_closer_asignado: sinCloser,
  });
}
