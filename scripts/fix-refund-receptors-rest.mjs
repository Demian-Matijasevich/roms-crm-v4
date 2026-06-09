import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const IDS = [
  "b5e2ec9d-3535-4d42-a8d9-5873fe7b7847", // Rafael Porras $10k 31/05
  "0a8c6184-6d6e-4755-ac14-61562f90eca3", // Silvana Paje $1200 08/05
];

for (const id of IDS) {
  const { data: r, error: e1 } = await sb.from("payments").select("id, monto_usd, receptor, fecha_pago, lead:leads!payments_lead_id_fkey(nombre)").eq("id", id).maybeSingle();
  if (e1) { console.log(`✗ select err ${id}: ${e1.message}`); continue; }
  if (!r) { console.log(`✗ no encontrado: ${id}`); continue; }
  const nombre = (r.lead && r.lead.nombre) || "—";
  const nuevo = "JUANMA - " + (r.receptor || "Refund");
  const { error: e2 } = await sb.from("payments").update({ receptor: nuevo }).eq("id", id);
  if (e2) { console.log(`✗ update err ${id.slice(0,8)}: ${e2.message}`); continue; }
  console.log(`✓ ${id.slice(0, 8)} ${nombre} $${r.monto_usd} ${r.fecha_pago} → receptor='${nuevo.slice(0, 50)}'`);
}
console.log("\n✅ Listo");
