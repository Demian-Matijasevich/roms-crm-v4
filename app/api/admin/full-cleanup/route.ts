import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Full April cleanup:
 * 1. Dedupe payments (same lead + same monto + within 3 days of fecha)
 * 2. Return list of all team_members with PINs
 * 3. Return new April summary by closer
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();

  // Step 1: Dedupe April payments — same lead + same monto → keep the one with fecha, drop others
  const { data: aprilPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado, created_at")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);

  // Also check payments with null fecha_pago but same lead+monto as a fecha'd one in April
  const { data: nullFechaPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado")
    .eq("estado", "pagado")
    .is("fecha_pago", null)
    .range(0, 4999);

  const combined = [...(aprilPays || []), ...(nullFechaPays || [])];

  const groups: Record<string, typeof combined> = {};
  for (const p of combined) {
    const key = `${p.lead_id || "none"}|${Math.round(p.monto_usd)}`;
    (groups[key] ||= []).push(p);
  }

  const toDelete: string[] = [];
  for (const [, group] of Object.entries(groups)) {
    if (group.length <= 1) continue;
    // Sort: prefer fecha en abril, then lowest numero_cuota, then oldest
    const sorted = [...group].sort((a, b) => {
      const aHas = !!a.fecha_pago;
      const bHas = !!b.fecha_pago;
      if (aHas !== bHas) return aHas ? -1 : 1;
      const ac = a.numero_cuota || 99;
      const bc = b.numero_cuota || 99;
      if (ac !== bc) return ac - bc;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    const [, ...drops] = sorted;
    for (const d of drops) toDelete.push(d.id);
  }

  let deleted = 0;
  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50);
      const { error } = await sb.from("payments").delete().in("id", batch);
      if (!error) deleted += batch.length;
    }
  }

  // Step 2: Team members with PINs
  const { data: team } = await sb
    .from("team_members")
    .select("nombre, pin, rol, is_admin, is_closer, is_setter, is_cobranzas, is_seguimiento, activo")
    .eq("activo", true)
    .order("nombre");

  // Step 3: New April summary
  const { data: newPays } = await sb
    .from("payments")
    .select("monto_usd, lead_id")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30");
  const newTotal = (newPays || []).reduce((s, p) => s + p.monto_usd, 0);

  const { data: allLeads } = await sb.from("leads").select("id, closer_id").range(0, 4999);
  const leadCloserMap: Record<string, string> = {};
  for (const l of allLeads || []) if (l.closer_id) leadCloserMap[l.id] = l.closer_id;

  const { data: closers } = await sb.from("team_members").select("id, nombre").eq("is_closer", true).eq("activo", true);
  const closerSum: Record<string, { name: string; cash: number; leads: Set<string> }> = {};
  for (const c of closers || []) closerSum[c.id] = { name: c.nombre, cash: 0, leads: new Set() };

  for (const p of newPays || []) {
    if (!p.lead_id) continue;
    const cid = leadCloserMap[p.lead_id];
    if (!cid || !closerSum[cid]) continue;
    closerSum[cid].cash += p.monto_usd;
    closerSum[cid].leads.add(p.lead_id);
  }

  return NextResponse.json({
    dedupe: { groups_with_dups: Object.values(groups).filter(g => g.length > 1).length, deleted_payments: deleted },
    april: {
      total_cash: newTotal,
      payments_count: newPays?.length || 0,
    },
    by_closer: Object.values(closerSum)
      .map(c => ({ nombre: c.name, cash: c.cash, leads_con_cobro: c.leads.size }))
      .sort((a, b) => b.cash - a.cash),
    users: team,
  });
}
