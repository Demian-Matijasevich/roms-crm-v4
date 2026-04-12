import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, numero_cuota, receptor, metodo_pago, created_at")
    .eq("estado", "pagado")
    .is("fecha_pago", null)
    .range(0, 4999);

  console.log(`Total pagos sin fecha: ${pays?.length}`);

  const leadIds = [...new Set((pays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, fecha_llamada, fecha_agendado, sheets_row_index")
    .in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  let totalSum = 0;
  console.log("\nLista:");
  for (const p of pays || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    totalSum += p.monto_usd;
    console.log(
      `  $${String(p.monto_usd).padStart(7)} | cuota ${p.numero_cuota} | ${lead?.nombre?.padEnd(30) || "NO LEAD".padEnd(30)} | estado:${lead?.estado || "—"} | llamada:${lead?.fecha_llamada?.split("T")[0] || "—"} | row:${lead?.sheets_row_index || "—"} | created:${p.created_at?.split("T")[0]}`
    );
  }
  console.log(`\nTotal: $${totalSum}`);
}

main().catch(console.error);
