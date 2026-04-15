import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const valeId = "1fa97581-745d-4097-bf2d-84a0650ccd63";

  // All April payments
  const { data: aprilPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, estado")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);

  const leadIds = [...new Set((aprilPays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id,nombre,closer_id,setter_id,estado").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  console.log("All April payments + closer/setter:");
  const closerTotals: Record<string, number> = {};
  for (const p of aprilPays || []) {
    const l = leadMap[p.lead_id!];
    if (!l) continue;
    const closerSetter = `closer:${l.closer_id?.substring(0,8) || "—"} setter:${l.setter_id?.substring(0,8) || "—"}`;
    console.log(`  ${l.nombre.padEnd(30)} $${p.monto_usd.toString().padStart(7)} ${p.fecha_pago?.split("T")[0]} ${closerSetter}`);
    if (l.closer_id) closerTotals[l.closer_id] = (closerTotals[l.closer_id] || 0) + p.monto_usd;
  }

  console.log("\nTotales por closer_id:");
  for (const [cid, total] of Object.entries(closerTotals)) console.log(`  ${cid.substring(0,8)}: $${total} → 10% = $${total * 0.1}`);
  console.log(`\nValentino ID: ${valeId.substring(0,8)}`);
}
main().catch(console.error);
