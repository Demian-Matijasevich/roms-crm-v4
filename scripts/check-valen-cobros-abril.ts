import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const valeId = "1fa97581-745d-4097-bf2d-84a0650ccd63";
  const { data: leadsVale } = await sb.from("leads").select("id,nombre,fecha_llamada,estado").eq("closer_id", valeId).range(0, 4999);
  const leadMap = Object.fromEntries((leadsVale || []).map((l) => [l.id, l]));
  // Fetch all April payments and filter in JS (avoids .in() limit)
  const { data: allPays } = await sb
    .from("payments")
    .select("lead_id,monto_usd,fecha_pago,numero_cuota")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);
  const valeLeadIds = new Set((leadsVale || []).map((l) => l.id));
  const pays = (allPays || []).filter((p) => p.lead_id && valeLeadIds.has(p.lead_id));
  const uniqLeads = new Set<string>();
  let total = 0;
  console.log("Pagos en abril de leads con closer=Valen:");
  for (const p of pays || []) {
    uniqLeads.add(p.lead_id!);
    total += p.monto_usd;
    const lead = leadMap[p.lead_id!];
    console.log(`  ${lead?.nombre.padEnd(30)} c${p.numero_cuota} $${p.monto_usd.toString().padStart(6)} ${p.fecha_pago?.split("T")[0]} (llamada ${lead?.fecha_llamada?.split("T")[0] || "—"}, estado ${lead?.estado})`);
  }
  console.log(`\nLeads únicos con cobro en abril: ${uniqLeads.size}`);
  console.log(`Total cobrado: $${total}`);
  console.log(`Comisión 10%: $${total * 0.1}`);
}
main().catch(console.error);
