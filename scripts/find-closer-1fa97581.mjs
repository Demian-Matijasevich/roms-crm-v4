/**
 * Busca al closer fantasma 1fa97581-745d-4097-bf2d-84a0650ccd63
 * y otras pistas de por qué este lead aparecería en política.
 */
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

// 1. Buscar en todas las tablas que tengan ese ID
console.log("=== auth.users ===");
try {
  const { data: authUser } = await sb.auth.admin.getUserById(closerId);
  console.log(JSON.stringify(authUser?.user ? { id: authUser.user.id, email: authUser.user.email, metadata: authUser.user.user_metadata, app_metadata: authUser.user.app_metadata } : null, null, 2));
} catch (err) { console.log("err", err.message); }

console.log("\n=== profiles ===");
const { data: prof } = await sb.from("profiles").select("*").eq("id", closerId).maybeSingle();
console.log(JSON.stringify(prof, null, 2));

console.log("\n=== users (si existe) ===");
try {
  const { data: usr } = await sb.from("users").select("*").eq("id", closerId).maybeSingle();
  console.log(JSON.stringify(usr, null, 2));
} catch (err) { console.log("(no existe tabla users)"); }

// Cuántos leads tiene ese closer fantasma
console.log("\n=== Leads asignados a ese closer ===");
const { data: leadsByCloser } = await sb.from("leads").select("id, nombre, nicho, programa_pitcheado, estado, fecha_llamada").eq("closer_id", closerId);
console.log(`Total: ${leadsByCloser?.length || 0}`);
const porNicho = {};
for (const l of leadsByCloser || []) {
  porNicho[l.nicho || "null"] = (porNicho[l.nicho || "null"] || 0) + 1;
}
console.log("Por nicho:", porNicho);

console.log("\n=== Primeros 10 leads de ese closer ===");
for (const l of (leadsByCloser || []).slice(0, 10)) {
  console.log(`  ${l.nombre} | nicho=${l.nicho} | prog=${l.programa_pitcheado} | estado=${l.estado}`);
}
