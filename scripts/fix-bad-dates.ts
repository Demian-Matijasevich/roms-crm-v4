import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes("--apply");

async function main() {
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado")
    .eq("estado", "pagado")
    .not("fecha_pago", "is", null)
    .range(0, 4999);
  const leadIds = [...new Set((pays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id, nombre, fecha_llamada").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  const toDelete: { id: string; info: string }[] = [];
  for (const p of pays || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    if (!lead?.fecha_llamada) continue;
    const pFecha = p.fecha_pago!.split("T")[0];
    const lFecha = lead.fecha_llamada.split("T")[0];
    if (pFecha >= lFecha) continue;
    const diff = Math.floor((new Date(lFecha).getTime() - new Date(pFecha).getTime()) / 86400000);
    if (diff > 20) {
      toDelete.push({ id: p.id, info: `${lead.nombre} c${p.numero_cuota} $${p.monto_usd} pago:${pFecha} llamada:${lFecha} (${diff}d)` });
    }
  }

  console.log(`Bad date pagos to delete (>20d before llamada): ${toDelete.length}`);
  for (const t of toDelete) console.log(`  ${t.info}`);

  if (!APPLY) { console.log("\n(dry run — pasá --apply)"); return; }

  console.log("\n🚀 Deleting...");
  for (const t of toDelete) {
    await sb.from("payments").delete().eq("id", t.id);
    console.log(`  ✓ ${t.info}`);
  }
  console.log("\nDone. Corré fase2-3-xlsx-sync --apply para re-importar con lead correcto.");
}

main().catch(console.error);
