import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: team } = await sb
    .from("team_members")
    .select("id, nombre, is_closer")
    .eq("is_closer", true);
  console.log("Closers:", team);

  const targets = (team || []).filter((t) => /agust|fede/i.test(t.nombre));
  for (const t of targets) {
    console.log(`\n── ${t.nombre} (${t.id.substring(0, 8)}) ──`);
    // Cerradas in April
    const { data: cerradas } = await sb
      .from("leads")
      .select("id, nombre, estado, fecha_llamada, ticket_total")
      .eq("closer_id", t.id)
      .gte("fecha_llamada", "2026-04-01")
      .lte("fecha_llamada", "2026-04-30")
      .in("estado", ["cerrado", "adentro_seguimiento"]);
    console.log(`  Cerradas abril:`);
    for (const c of cerradas || []) console.log(`    ${c.nombre} | ${c.estado} | llamada:${c.fecha_llamada?.split("T")[0]} | ticket:$${c.ticket_total}`);

    // Payments in April attributed to t's leads
    const { data: allLeads } = await sb.from("leads").select("id,nombre").eq("closer_id", t.id).range(0, 4999);
    const leadIdSet = new Set((allLeads || []).map((l) => l.id));
    const { data: aprilPays } = await sb
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_pago")
      .eq("estado", "pagado")
      .gte("fecha_pago", "2026-04-01")
      .lte("fecha_pago", "2026-04-30")
      .range(0, 4999);
    const matched = (aprilPays || []).filter((p) => p.lead_id && leadIdSet.has(p.lead_id));
    const leadNameById = Object.fromEntries((allLeads || []).map((l) => [l.id, l.nombre]));
    console.log(`  Pagos abril de sus leads: ${matched.length}`);
    for (const p of matched) console.log(`    ${leadNameById[p.lead_id!]} $${p.monto_usd} ${p.fecha_pago?.split("T")[0]}`);

    // All payments for the cerradas leads (any date)
    console.log(`  TODOS los pagos de los leads cerrados abril:`);
    for (const c of cerradas || []) {
      const { data: ps } = await sb.from("payments").select("monto_usd,fecha_pago,estado,numero_cuota").eq("lead_id", c.id);
      for (const p of ps || []) console.log(`    ${c.nombre} c${p.numero_cuota} $${p.monto_usd} ${p.fecha_pago?.split("T")[0] || "—"} ${p.estado}`);
    }
  }
}
main().catch(console.error);
