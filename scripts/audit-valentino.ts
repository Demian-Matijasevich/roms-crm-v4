import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1) Find Valentino
  const { data: vale } = await sb.from("team_members").select("id,nombre,etiqueta,is_closer,is_setter,is_admin").ilike("nombre", "%valen%");
  console.log("Team Valentino:", vale);

  const valeId = vale?.[0]?.id;
  if (!valeId) return;

  // 2) v_closer_kpis row for current fiscal month
  const { data: kpis } = await sb.from("v_closer_kpis").select("*").eq("team_member_id", valeId);
  console.log("\nv_closer_kpis:");
  for (const k of kpis || []) console.log(" ", k);

  // 3) v_commissions row
  const { data: comms } = await sb.from("v_commissions").select("*").eq("team_member_id", valeId);
  console.log("\nv_commissions:");
  for (const c of comms || []) console.log(" ", c);

  // 4) All leads where Valentino is closer or setter
  const { data: asCloser } = await sb
    .from("leads")
    .select("id,nombre,estado,fecha_llamada,fecha_agendado,ticket_total,setter_id,closer_id")
    .eq("closer_id", valeId)
    .range(0, 4999);
  console.log(`\nLeads as CLOSER: ${asCloser?.length}`);
  const closedByVale = (asCloser || []).filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento");
  console.log(`  Cerradas (cerrado + adentro_seg): ${closedByVale.length}`);
  for (const l of closedByVale) console.log(`    ${l.nombre} | ${l.estado} | llamada:${l.fecha_llamada?.split("T")[0] || "—"} | ticket:$${l.ticket_total}`);

  const { data: asSetter } = await sb
    .from("leads")
    .select("id,nombre,estado,fecha_llamada,ticket_total")
    .eq("setter_id", valeId)
    .range(0, 4999);
  console.log(`\nLeads as SETTER: ${asSetter?.length}`);
  const closedBySetter = (asSetter || []).filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento");
  console.log(`  Cerradas (como setter): ${closedBySetter.length}`);

  // 5) Payments attributed to these leads in April
  const leadIds = [...new Set([...(asCloser || []).map(l=>l.id), ...(asSetter || []).map(l=>l.id)])];
  const { data: pays } = await sb
    .from("payments")
    .select("id,lead_id,monto_usd,fecha_pago,estado,receptor")
    .in("lead_id", leadIds)
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);
  const payMap: Record<string, any> = {};
  for (const l of [...(asCloser || []), ...(asSetter || [])]) payMap[l.id] = l;
  console.log(`\nPayments en ABRIL de leads tocados por Valen: ${pays?.length}, total $${(pays||[]).reduce((s,p)=>s+p.monto_usd,0)}`);
  for (const p of pays || []) {
    const l = payMap[p.lead_id!];
    const role = (asCloser || []).some(a => a.id === p.lead_id) ? "CLOSER" : "SETTER";
    console.log(`  ${role} | ${l?.nombre} $${p.monto_usd} ${p.fecha_pago?.split("T")[0]} | estado lead:${l?.estado}`);
  }
}

main().catch(console.error);
