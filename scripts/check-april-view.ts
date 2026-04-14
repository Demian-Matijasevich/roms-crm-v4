import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Check specific leads showing up in April that shouldn't
  for (const name of ["Rodrigo Bailone", "IRENO", "Rodrigo De Loredo", "Pedro Agüero", "Saba", "Ivan Barrera", "Jorge"]) {
    const { data: leads } = await sb.from("leads").select("id, nombre, estado, fecha_llamada, fecha_agendado, ticket_total").ilike("nombre", name);
    for (const lead of leads || []) {
      const { data: pays } = await sb
        .from("payments")
        .select("monto_usd, fecha_pago, estado, numero_cuota")
        .eq("lead_id", lead.id);
      console.log(`\n── ${lead.nombre} | llamada:${lead.fecha_llamada?.split("T")[0] || "—"} | agenda:${lead.fecha_agendado?.split("T")[0] || "—"} | estado:${lead.estado} | ticket:$${lead.ticket_total}`);
      for (const p of pays || []) {
        console.log(`   c${p.numero_cuota} $${p.monto_usd} | ${p.fecha_pago?.split("T")[0] || "—"} | ${p.estado}`);
      }
    }
  }
}

main().catch(console.error);
