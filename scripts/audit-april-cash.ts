import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1. Dashboard calc: v_monthly_cash for April 2026
  const { data: monthly } = await sb.from("v_monthly_cash").select("*");
  console.log("v_monthly_cash (todas las filas):");
  for (const m of monthly || []) console.log(" ", m);

  // 2. Raw payments: sum of pagado with fecha_pago in April
  const { data: paysApril } = await sb
    .from("payments")
    .select("monto_usd, fecha_pago, lead_id, numero_cuota, estado")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);
  const totalApril = (paysApril || []).reduce((s, p) => s + p.monto_usd, 0);
  console.log(`\n2) Payments con fecha_pago EN abril (pagados): ${paysApril?.length} pagos, total $${totalApril}`);

  // 3. Payments with null fecha_pago but maybe from April leads
  const { data: paysNull } = await sb
    .from("payments")
    .select("monto_usd, lead_id, numero_cuota")
    .eq("estado", "pagado")
    .is("fecha_pago", null)
    .range(0, 4999);
  const totalNull = (paysNull || []).reduce((s, p) => s + p.monto_usd, 0);
  console.log(`\n3) Payments pagados SIN fecha_pago: ${paysNull?.length} pagos, total $${totalNull}`);

  // 4. Calendario calc: leads with fecha_llamada in April and estado cerrado, summing ticket_total
  const { data: leadsApril } = await sb
    .from("leads")
    .select("id, nombre, estado, ticket_total, fecha_llamada")
    .gte("fecha_llamada", "2026-04-01")
    .lte("fecha_llamada", "2026-04-30")
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .range(0, 4999);
  const totalTicket = (leadsApril || []).reduce((s, l) => s + (l.ticket_total || 0), 0);
  console.log(`\n4) Leads con fecha_llamada EN abril cerrados/adentro_seg: ${leadsApril?.length}, ticket total $${totalTicket}`);
  for (const l of leadsApril || []) console.log(`   ${l.nombre} | ${l.estado} | ticket $${l.ticket_total} | ${l.fecha_llamada?.split("T")[0]}`);

  // 5. All pagado payments (for reference)
  const { data: allPays } = await sb
    .from("payments")
    .select("monto_usd, fecha_pago")
    .eq("estado", "pagado")
    .range(0, 4999);
  const total = (allPays || []).reduce((s, p) => s + p.monto_usd, 0);
  console.log(`\n5) TOTAL de todos los pagos pagados en DB: ${allPays?.length} pagos, $${total}`);
}

main().catch(console.error);
