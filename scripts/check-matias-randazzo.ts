import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, sheets_row_index, ticket_total")
    .ilike("nombre", "%matias randazzo%");
  console.log("Matias Randazzo leads:", leads);

  for (const lead of leads || []) {
    const { data: pays } = await sb
      .from("payments")
      .select("id, monto_usd, fecha_pago, numero_cuota, estado, receptor")
      .eq("lead_id", lead.id)
      .order("numero_cuota");
    console.log(`\nrow ${lead.sheets_row_index} id:${lead.id.substring(0, 8)} estado:${lead.estado}`);
    for (const p of pays || []) {
      console.log(`  c${p.numero_cuota} $${p.monto_usd} | ${p.fecha_pago?.split("T")[0] || "—"} | ${p.estado} | ${p.receptor || "—"}`);
    }
  }

  // Also check Luciano Molero, Noelia, Silvana
  for (const name of ["Luciano Molero", "Noelia Conde", "silvana paje"]) {
    const { data } = await sb
      .from("leads")
      .select("id, nombre, estado, sheets_row_index, ticket_total")
      .ilike("nombre", name);
    for (const l of data || []) {
      const { data: pays } = await sb
        .from("payments")
        .select("monto_usd, fecha_pago, numero_cuota, estado")
        .eq("lead_id", l.id)
        .order("fecha_pago");
      console.log(`\n── ${l.nombre} row:${l.sheets_row_index} estado:${l.estado} ticket:$${l.ticket_total}`);
      for (const p of pays || []) console.log(`  c${p.numero_cuota} $${p.monto_usd} | ${p.fecha_pago?.split("T")[0] || "—"} | ${p.estado}`);
    }
  }
}

main().catch(console.error);
