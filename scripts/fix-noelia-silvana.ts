import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: noelias } = await sb
    .from("leads")
    .select("id, nombre, estado, sheets_row_index")
    .ilike("nombre", "%noelia conde%");
  console.log("Noelias:", noelias);

  // Delete pending duplicate Noelia (no row, no payments)
  const pendingNoelia = noelias?.find((l) => l.estado === "pendiente" && !l.sheets_row_index);
  if (pendingNoelia) {
    await sb.from("payments").delete().eq("lead_id", pendingNoelia.id);
    await sb.from("leads").delete().eq("id", pendingNoelia.id);
    console.log(`Deleted pending Noelia duplicate ${pendingNoelia.id}`);
  }

  const realNoelia = noelias?.find((l) => l.estado === "cerrado" && l.sheets_row_index);
  if (realNoelia) {
    // Delete all payments, re-create only $1200 on 2026-04-12
    await sb.from("payments").delete().eq("lead_id", realNoelia.id);
    await sb.from("payments").insert({
      lead_id: realNoelia.id,
      monto_usd: 1200,
      fecha_pago: "2026-04-12",
      estado: "pagado",
      receptor: "JUANMA",
    });
    await sb.from("leads").update({ ticket_total: 1200 }).eq("id", realNoelia.id);
    console.log(`Noelia fixed: ticket $1200, 1 pago $1200 2026-04-12`);
  }

  // Silvana
  const { data: silvanas } = await sb
    .from("leads")
    .select("id, nombre, estado, sheets_row_index")
    .ilike("nombre", "%silvana paje%");
  console.log("Silvanas:", silvanas);

  const silvana = silvanas?.[0];
  if (silvana) {
    await sb.from("payments").delete().eq("lead_id", silvana.id);
    await sb.from("payments").insert({
      lead_id: silvana.id,
      monto_usd: 1200,
      fecha_pago: "2026-04-12",
      estado: "pagado",
      receptor: "JUANMA",
    });
    await sb.from("leads").update({ ticket_total: 1200 }).eq("id", silvana.id);
    console.log(`Silvana fixed: ticket $1200, 1 pago $1200 2026-04-12`);
  }
}

main().catch(console.error);
