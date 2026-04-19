import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const desde = url.searchParams.get("desde") || "2026-04-13";
  const hasta = url.searchParams.get("hasta") || "2026-04-19";

  const sb = createServerClient();

  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, receptor, numero_cuota, estado, es_renovacion")
    .eq("estado", "pagado")
    .gte("fecha_pago", desde)
    .lte("fecha_pago", hasta)
    .order("fecha_pago");

  const leadIds = [...new Set((pays || []).map(p => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, closer_id, setter_id, fecha_llamada, fecha_agendado, sheets_row_index")
    .in("id", leadIds);
  const leadById = new Map((leads || []).map(l => [l.id, l]));

  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map(t => [t.id, t.nombre] as const));

  const byCloser: Record<string, Array<{ lead: string; lead_estado: string; fecha_pago: string | null; monto: number; cuota: number; row: number | null; fecha_llamada: string | null; es_renovacion: boolean }>> = {};
  const sinCloser: Array<{ lead: string; lead_estado: string; fecha_pago: string | null; monto: number; cuota: number; row: number | null; fecha_llamada: string | null; es_renovacion: boolean }> = [];

  for (const p of pays || []) {
    const l = p.lead_id ? leadById.get(p.lead_id) : null;
    const entry = {
      lead: l?.nombre || "(sin lead)",
      lead_estado: l?.estado || "?",
      fecha_pago: p.fecha_pago,
      monto: p.monto_usd,
      cuota: p.numero_cuota,
      row: l?.sheets_row_index || null,
      fecha_llamada: l?.fecha_llamada || null,
      es_renovacion: p.es_renovacion,
    };

    if (!l?.closer_id) {
      sinCloser.push(entry);
      continue;
    }
    const name = teamById.get(l.closer_id) || "¿?";
    if (!byCloser[name]) byCloser[name] = [];
    byCloser[name].push(entry);
  }

  // Summary
  const summary: Record<string, { leads: number; cash: number; payments: number }> = {};
  for (const [name, entries] of Object.entries(byCloser)) {
    const uniqueLeads = new Set(entries.map(e => e.lead)).size;
    const cash = entries.reduce((s, e) => s + e.monto, 0);
    summary[name] = { leads: uniqueLeads, cash, payments: entries.length };
  }

  return NextResponse.json({
    rango: { desde, hasta },
    total_payments: pays?.length || 0,
    total_cash: (pays || []).reduce((s, p) => s + p.monto_usd, 0),
    summary,
    by_closer: byCloser,
    sin_closer: sinCloser,
  });
}
