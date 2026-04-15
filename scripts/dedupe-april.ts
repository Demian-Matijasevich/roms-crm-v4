import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes("--apply");

async function main() {
  // All April paid payments
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, receptor, created_at")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);

  const { data: leads } = await sb.from("leads").select("id,nombre").in("id", [...new Set((pays || []).map(p=>p.lead_id).filter(Boolean))]);
  const leadMap = Object.fromEntries((leads || []).map(l => [l.id, l.nombre]));

  // Group by lead_NAME + monto_usd (ignoring lead_id — catches cross-lead dups from sync recreating entries)
  const groups: Record<string, typeof pays> = {};
  for (const p of pays || []) {
    const nombre = leadMap[p.lead_id!] || "NO-LEAD";
    const key = `${nombre.toLowerCase().trim()}|${Math.round(p.monto_usd)}`;
    (groups[key] ||= []).push(p);
  }

  const toDelete: { id: string; info: string }[] = [];
  for (const [key, g] of Object.entries(groups)) {
    if (g.length <= 1) continue;
    const leadName = leadMap[g[0].lead_id!] || "NO-LEAD";
    // Sort: prefer most recent fecha_pago (likely the correct one from xlsx), then oldest created
    const sorted = g.sort((a, b) => {
      // Keep the one with FECHA most recent
      const fa = a.fecha_pago || "";
      const fb = b.fecha_pago || "";
      return fb.localeCompare(fa);
    });
    const [keep, ...drops] = sorted;
    console.log(`${leadName} $${keep.monto_usd}: keep ${keep.fecha_pago?.split("T")[0]} (${keep.id.substring(0,8)}), drop ${drops.length}`);
    for (const d of drops) {
      console.log(`  DROP ${d.fecha_pago?.split("T")[0]} ${d.id.substring(0,8)}`);
      toDelete.push({ id: d.id, info: `${leadName} $${d.monto_usd} ${d.fecha_pago?.split("T")[0]}` });
    }
  }

  console.log(`\nTotal to delete: ${toDelete.length}`);
  if (!APPLY) { console.log("(dry)"); return; }

  for (const t of toDelete) {
    await sb.from("payments").delete().eq("id", t.id);
    console.log(`  ✓ ${t.info}`);
  }
}
main().catch(console.error);
