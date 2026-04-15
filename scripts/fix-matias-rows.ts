import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: leads } = await sb.from("leads").select("id,nombre,sheets_row_index").ilike("nombre", "%matias randazzo%");
  console.log("Matias leads:", leads);

  const row660 = leads?.find((l) => l.sheets_row_index === 660);
  const row770 = leads?.find((l) => l.sheets_row_index === 770);
  if (!row660 || !row770) { console.log("missing row"); return; }

  // Fetch all payments of both
  const { data: pays660 } = await sb.from("payments").select("*").eq("lead_id", row660.id);
  const { data: pays770 } = await sb.from("payments").select("*").eq("lead_id", row770.id);
  console.log(`Row 660 pays: ${pays660?.length}`);
  console.log(`Row 770 pays: ${pays770?.length}`);

  // The correct payments (per xlsx): $10k + $20k on 07/04, both cuota 1
  // Row 770 has c1 $10k 07/04 and c2 $20k no fecha — also wrong
  // Row 660 has c1 $10k 07/04 and c1 $20k 07/04 — these are the real ones
  // Strategy: move the real c1 $10k + c1 $20k from row 660 to row 770, delete everything else

  // Get the 2 correct pays from 660
  const good = (pays660 || []).filter((p) => p.numero_cuota === 1 && (p.monto_usd === 10000 || p.monto_usd === 20000) && p.fecha_pago?.startsWith("2026-04-07"));
  console.log(`Good pays to keep: ${good.length}`);

  // Move them to row 770
  for (const p of good) {
    const { error } = await sb.from("payments").update({ lead_id: row770.id }).eq("id", p.id);
    if (error) console.error("move err:", error);
    else console.log(`  ✓ moved ${p.id.substring(0,8)} $${p.monto_usd} to row 770`);
  }

  // Delete any other pays from both rows (duplicates, sin fecha, etc.)
  const toDelete = [
    ...(pays660 || []).filter((p) => !good.some((g) => g.id === p.id)),
    ...(pays770 || []),
  ];
  for (const p of toDelete) {
    await sb.from("payments").delete().eq("id", p.id);
    console.log(`  ✓ deleted ${p.id.substring(0,8)} $${p.monto_usd} ${p.fecha_pago?.split("T")[0] || "—"}`);
  }

  // Delete the ghost lead row 660 (it will get re-created as Marcos Meilan by sync)
  await sb.from("leads").delete().eq("id", row660.id);
  console.log(`✓ deleted ghost lead row 660`);
}
main().catch(console.error);
