import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: lead } = await sb.from("leads").select("id").ilike("nombre", "Andres Castrilli").single();
  if (!lead) return;
  const { data: pays } = await sb.from("payments").select("*").eq("lead_id", lead.id).eq("monto_usd", 18000);
  console.log(`Andres pays $18k: ${pays?.length}`);
  for (const p of pays || []) console.log(`  ${p.id.substring(0,8)} ${p.fecha_pago?.split("T")[0]} estado:${p.estado}`);
  // Keep the one with fecha 2026-04-11 (the correct one from xlsx), delete 01/04
  const toDelete = (pays || []).filter((p) => p.fecha_pago?.startsWith("2026-04-01"));
  for (const p of toDelete) {
    await sb.from("payments").delete().eq("id", p.id);
    console.log(`  ✓ deleted ${p.id.substring(0,8)}`);
  }
}
main().catch(console.error);
