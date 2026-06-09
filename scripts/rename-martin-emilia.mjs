/**
 * Renombra el lead "Martin Miño" a "Emilia López" (es el mismo cliente, alta mal cargada).
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

const LEAD_ID = "5e67908d-d6fc-48cc-8abb-d50e47151775";

const { data: before } = await sb.from("leads").select("nombre").eq("id", LEAD_ID).single();
console.log(`Antes: "${before?.nombre}"`);

const { error } = await sb.from("leads").update({ nombre: "Emilia López" }).eq("id", LEAD_ID);
if (error) {
  console.log(`✗ ERROR: ${error.message}`);
  process.exit(1);
}

const { data: after } = await sb.from("leads").select("nombre").eq("id", LEAD_ID).single();
console.log(`Después: "${after?.nombre}"`);
console.log("✓ Renombrado");
