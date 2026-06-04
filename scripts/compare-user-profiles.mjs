/**
 * Compara estructuras completas de perfiles para Mati, Juanma, Seba, Nacho.
 * Muestra TODOS los campos de team_members + busca en otras tablas.
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

const nombres = ["Mati", "Juanma", "Fran", "Seba", "Nacho"];

for (const nombre of nombres) {
  console.log(`\n══════════════════════════════════════`);
  console.log(`👤 ${nombre}`);
  console.log(`══════════════════════════════════════`);
  const { data } = await sb.from("team_members").select("*").eq("nombre", nombre).maybeSingle();
  if (!data) {
    console.log("  ✗ no existe en team_members");
    continue;
  }
  for (const [k, v] of Object.entries(data)) {
    const str = v === null ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v);
    console.log(`  ${k.padEnd(22)} = ${str}`);
  }
}

// Buscar otras tablas que tengan datos de perfil
console.log("\n══════════════════════════════════════");
console.log("Tablas con info adicional de usuario?");
console.log("══════════════════════════════════════");
for (const tabla of ["profiles", "users", "user_settings", "user_preferences"]) {
  try {
    const { data, error } = await sb.from(tabla).select("*").limit(1);
    if (error) console.log(`  ${tabla}: ${error.message}`);
    else if (data && data.length > 0) console.log(`  ${tabla}: ${Object.keys(data[0]).join(", ")}`);
    else console.log(`  ${tabla}: existe, vacía`);
  } catch (err) {
    console.log(`  ${tabla}: no existe`);
  }
}
