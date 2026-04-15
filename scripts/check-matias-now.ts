import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: leads } = await sb.from("leads").select("id,nombre,sheets_row_index").ilike("nombre", "%matias randazzo%");
  console.log("Matias Randazzo leads:", leads);
  for (const l of leads || []) {
    const { data: pays } = await sb.from("payments").select("id,monto_usd,fecha_pago,numero_cuota,estado").eq("lead_id", l.id);
    console.log(`\n${l.nombre} row ${l.sheets_row_index} id:${l.id.substring(0,8)}`);
    for (const p of pays || []) console.log(`  c${p.numero_cuota} $${p.monto_usd} ${p.fecha_pago?.split("T")[0]} ${p.estado}`);
  }
}
main().catch(console.error);
