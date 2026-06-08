/**
 * Corrige los 3 leads que estaban cerrado pero les puse etapa_politica=nuevo:
 * Rodrigo De Loredo, Alberto Weretilneck, Santiago Pinsiroli.
 * Si su estado='cerrado', etapa_politica también debe ser 'cerrado'.
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

const { data: leads } = await sb.from("leads").select("id, nombre, estado, etapa_politica")
  .in("nombre", ["Rodrigo De Loredo", "Alberto Weretilneck", "Santiago Pinsiroli"]);

for (const l of leads || []) {
  if (l.estado === "cerrado" && l.etapa_politica !== "cerrado") {
    await sb.from("leads").update({ etapa_politica: "cerrado" }).eq("id", l.id);
    console.log(`✓ ${l.nombre} → etapa_politica=cerrado`);
  }
}
