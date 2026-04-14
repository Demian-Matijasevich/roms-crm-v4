import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: allPays } = await sb
    .from("payments")
    .select("id, lead_id, client_id, monto_usd, fecha_pago, numero_cuota, estado, receptor, created_at")
    .eq("estado", "pagado")
    .range(0, 4999);

  // Group by lead|monto|fecha (treat null lead/fecha as their own bucket)
  const groups: Record<string, typeof allPays> = {};
  for (const p of allPays || []) {
    const key = `${p.lead_id || p.client_id || "null"}|${Math.round(p.monto_usd)}|${p.fecha_pago?.split("T")[0] || "nodate"}`;
    (groups[key] ||= []).push(p);
  }

  const toDelete: string[] = [];
  const summary: { key: string; kept: string; dropped: number; monto: number }[] = [];
  for (const [key, group] of Object.entries(groups)) {
    if (group.length <= 1) continue;
    // Keep the FIRST created (oldest), drop the rest. Prefer one with non-null fields.
    const sorted = group.sort((a, b) => {
      // Prefer: has lead_id > has receptor > lowest cuota > oldest created
      const aScore = (a.lead_id ? 4 : 0) + (a.receptor ? 2 : 0) + (a.numero_cuota === 1 ? 1 : 0);
      const bScore = (b.lead_id ? 4 : 0) + (b.receptor ? 2 : 0) + (b.numero_cuota === 1 ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    const [keep, ...drops] = sorted;
    for (const d of drops) toDelete.push(d.id);
    summary.push({ key, kept: keep.id.substring(0, 8), dropped: drops.length, monto: keep.monto_usd });
  }

  console.log(`Total groups with duplicates: ${summary.length}`);
  console.log(`Total payments to delete: ${toDelete.length}`);
  const totalBorrar = summary.reduce((s, g) => s + g.monto * g.dropped, 0);
  console.log(`Total $ eliminado (ya duplicado): $${totalBorrar}\n`);

  for (const s of summary) console.log(`  ${s.key} → keep:${s.kept} drop:${s.dropped}`);

  if (process.argv.includes("--apply")) {
    console.log("\n🚀 Aplicando...");
    // Delete in batches of 50
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50);
      const { error } = await sb.from("payments").delete().in("id", batch);
      if (error) { console.error("Error:", error); break; }
      console.log(`  ✓ Deleted ${Math.min(i + 50, toDelete.length)}/${toDelete.length}`);
    }
    console.log("Done.");
  } else {
    console.log("\n(dry run — pasá --apply para ejecutar)");
  }
}

main().catch(console.error);
