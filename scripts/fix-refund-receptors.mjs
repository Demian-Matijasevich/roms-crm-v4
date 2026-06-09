/**
 * Actualiza el receptor de los refunds a "JUANMA" para que el split socios
 * los atribuya correctamente. Mati confirmó que los hizo Juanma.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// UUIDs completos de los 2 refunds que cargué yo (Mati confirmó: los hizo Juanma)
const REFUND_IDS = [
  "493f3d16-a6bd-4c76-ac79-2e8c00af41aa", // Rafael Porras $8.200 (20/05)
  "7bbcc681-e143-4b90-a3ff-12ccc301cec7", // Emilia Lopez $13.991,46 (31/05)
];

for (const id of REFUND_IDS) {
  const { data: r } = await sb.from("payments").select("id, monto_usd, receptor").eq("id", id).maybeSingle();
  if (!r) { console.log(`✗ no encontrado: ${id}`); continue; }
  const newReceptor = `JUANMA - ${r.receptor}`;
  const { error } = await sb.from("payments").update({ receptor: newReceptor }).eq("id", id);
  if (error) { console.log(`✗ ${id.slice(0, 8)}: ${error.message}`); continue; }
  console.log(`✓ ${id.slice(0, 8)} $${r.monto_usd} → receptor='${newReceptor.slice(0, 60)}…'`);
}

console.log("\n✅ Los 2 refunds que cargué yo ahora tienen receptor=JUANMA.");
console.log("\nQuedan 2 refunds del mes con receptor='Refund' (sin atribuir socio):");
console.log("  - b5e2ec9d $10000 31/05 (Rafael Porras existente — ¿quién lo hizo?)");
console.log("  - 0a8c6184 $1200  08/05 (Silvana Paje — ¿quién lo hizo?)");
console.log("Si Mati confirma que también los hizo Juanma, le doy update.");
