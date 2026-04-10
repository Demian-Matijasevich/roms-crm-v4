import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Normalization map: all variants → canonical name
const RECEPTOR_MAP: Record<string, string> = {
  juanma: "JUANMA",
  "juanma wise": "JUANMA",
  juanbma: "JUANMA",
  fran: "FRAN",
  valen: "VALEN",
  manual: "Manual",
};

function normalizeReceptor(raw: string): string {
  const key = raw.trim().toLowerCase();
  return RECEPTOR_MAP[key] || raw.trim();
}

async function main() {
  // Step 1: Get all payments with non-null receptor
  const { data: payments, error } = await sb
    .from("payments")
    .select("id,receptor,monto_usd")
    .not("receptor", "is", null);

  if (error) {
    console.error("Error fetching payments:", error);
    return;
  }

  console.log(`Payments with receptor: ${payments.length}`);

  let updated = 0;
  let unchanged = 0;

  for (const p of payments) {
    const normalized = normalizeReceptor(p.receptor);
    if (normalized !== p.receptor) {
      const { error: updateErr } = await sb
        .from("payments")
        .update({ receptor: normalized })
        .eq("id", p.id);

      if (updateErr) {
        console.error(`Error updating ${p.id}:`, updateErr.message);
      } else {
        console.log(`  ${p.receptor} → ${normalized} (id: ${p.id}, $${p.monto_usd})`);
        updated++;
      }
    } else {
      unchanged++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${unchanged} unchanged`);

  // Step 2: Show final distribution
  const { data: all } = await sb.from("payments").select("id,receptor,monto_usd");
  const byReceptor: Record<string, { count: number; sum: number }> = {};
  for (const p of all || []) {
    const r = p.receptor || "NULL";
    if (!byReceptor[r]) byReceptor[r] = { count: 0, sum: 0 };
    byReceptor[r].count++;
    byReceptor[r].sum += p.monto_usd || 0;
  }

  console.log("\nFinal receptor distribution:");
  for (const [k, v] of Object.entries(byReceptor).sort((a, b) => b[1].sum - a[1].sum)) {
    console.log(`  ${k}: ${v.count} payments, $${v.sum.toFixed(0)}`);
  }
}

main().catch(console.error);
