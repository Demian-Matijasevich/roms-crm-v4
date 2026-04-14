import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1) v_monthly_cash for Abril
  const { data: mc } = await sb.from("v_monthly_cash").select("*").eq("mes_fiscal", "Abril 2026");
  console.log("v_monthly_cash Abril:", mc);

  // 2) All payments with fecha_pago in April
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado, receptor, metodo_pago, es_renovacion, client_id")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .order("fecha_pago")
    .range(0, 4999);
  const totalApril = (pays || []).reduce((s, p) => s + p.monto_usd, 0);
  console.log(`\nPayments with fecha_pago in Abril: ${pays?.length} = $${totalApril}`);

  const leadIds = [...new Set((pays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id,nombre,estado,fecha_llamada,ticket_total").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  console.log("\nDetalle (ordenado por fecha):");
  for (const p of pays || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    console.log(
      `  ${p.fecha_pago?.split("T")[0]} | $${String(p.monto_usd).padStart(7)} | c${p.numero_cuota} | ${lead?.nombre?.padEnd(30) || "NO LEAD".padEnd(30)} | llamada:${lead?.fecha_llamada?.split("T")[0] || "—"} | ticket:${lead?.ticket_total || 0} | receptor:${p.receptor || "—"}`
    );
  }

  // 3) Payments that are "out of month" (llamada in Feb/Jan but fecha_pago in April) - typical cuotas
  const outOfMonth = (pays || []).filter((p) => {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    if (!lead?.fecha_llamada) return false;
    const llamada = lead.fecha_llamada.split("T")[0];
    return llamada < "2026-04-01";
  });
  console.log(`\n\nPagos con llamada ANTERIOR a abril (cuotas diferidas, $${outOfMonth.reduce((s, p) => s + p.monto_usd, 0)}):`);
  for (const p of outOfMonth) {
    const lead = leadMap[p.lead_id!];
    console.log(`   ${lead.nombre} | c${p.numero_cuota} $${p.monto_usd} | llamada:${lead.fecha_llamada?.split("T")[0]} | pago:${p.fecha_pago?.split("T")[0]}`);
  }
}

main().catch(console.error);
