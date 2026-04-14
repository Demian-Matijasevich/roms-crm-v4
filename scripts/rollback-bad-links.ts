import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Find the 8 bad payments created in phase 2+3 today
  // Criteria: created today in abril with those specific monto/fecha
  const badPays = [
    { monto: 200, fecha: "2026-04-01", receptor: "FRAN" }, // Sofia Baldi mistaken adopt (NOT delete — this was orphan adopt, just revert)
    { monto: 300, fecha: "2026-04-02" },
    { monto: 200, fecha: "2026-04-02" },
    { monto: 430, fecha: "2026-04-04" },
    { monto: 500, fecha: "2026-04-08" },
    { monto: 500, fecha: "2026-04-10" },
    { monto: 9000, fecha: "2026-04-10" },
    { monto: 200, fecha: "2026-04-09" },
  ];

  // First: unlink the Sofia Dalia Vichich adopt (was an orphan adopted to wrong lead)
  console.log("Unlinking Sofia orphan...");
  const { data: sofia } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, lead:leads!payments_lead_id_fkey(nombre)")
    .eq("monto_usd", 200)
    .eq("fecha_pago", "2026-04-01")
    .eq("receptor", "FRAN");
  for (const p of sofia || []) {
    console.log(`  Found $200 04/01 FRAN → ${(p.lead as any)?.nombre || "(no lead)"}`);
    // This was an orphan before — revert to orphan
    await sb.from("payments").update({ lead_id: null }).eq("id", p.id);
    console.log(`  ✓ unlinked`);
  }

  // Delete the 7 newly created bad payments (created, not adopted)
  for (const c of badPays.slice(1)) {
    const { data: pays } = await sb
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, lead:leads!payments_lead_id_fkey(nombre)")
      .eq("monto_usd", c.monto)
      .eq("fecha_pago", c.fecha);
    for (const p of pays || []) {
      console.log(`  $${c.monto} ${c.fecha} → lead:${(p.lead as any)?.nombre || "—"}`);
      await sb.from("payments").delete().eq("id", p.id);
      console.log(`  ✓ deleted`);
    }
  }
}

main().catch(console.error);
