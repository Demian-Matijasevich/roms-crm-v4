import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const e = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const closerId = "1fa97581-745d-4097-bf2d-84a0650ccd63";

// closer
const { data: closer } = await sb.from("profiles").select("*").eq("id", closerId).maybeSingle();
console.log("\n=== CLOSER ===");
console.log(JSON.stringify(closer, null, 2));

// Buscar leads de política para ver qué tienen en común
console.log("\n=== Leads con nicho=politica ===");
const { data: politicaLeads } = await sb.from("leads").select("id, nombre, nicho, closer_id, programa_pitcheado, estado").eq("nicho", "politica");
console.log(`Total: ${politicaLeads?.length || 0}`);
for (const l of politicaLeads || []) {
  console.log(`  ${l.nombre} | closer=${l.closer_id?.slice(0,8)} | prog=${l.programa_pitcheado} | estado=${l.estado}`);
}

// Activity log para Nicolas Distrito
const leadId = "d1c73fd4";
const { data: leadFull } = await sb.from("leads").select("id").ilike("nombre", "Nicolas Distrito").maybeSingle();
if (leadFull) {
  try {
    const { data: logs } = await sb.from("activity_log").select("*").eq("lead_id", leadFull.id).order("created_at", { ascending: false });
    console.log(`\n=== Activity log para Nicolas Distrito (${logs?.length || 0}) ===`);
    for (const log of logs || []) {
      console.log(`  [${log.created_at}] ${log.action} | user=${log.user_email || log.user_id?.slice(0,8)} | ${JSON.stringify(log.details || {}).slice(0,150)}`);
    }
  } catch (err) {
    console.log("\n(no hay tabla activity_log o error)");
  }
}
