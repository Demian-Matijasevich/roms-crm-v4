/**
 * Crea team_member Nicolás (equipo política) — mismo perfil que Seba/Nacho.
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

const { data: existing } = await sb.from("team_members").select("nombre, pin");
const pinsTomados = new Set((existing || []).map((m) => m.pin).filter(Boolean));
const nombresTomados = new Set((existing || []).map((m) => m.nombre?.toLowerCase()).filter(Boolean));

if (nombresTomados.has("nicolás") || nombresTomados.has("nicolas")) {
  console.log("⚠ Ya existe un usuario Nicolás — abortando para no duplicar");
  process.exit(0);
}

let pin = 1007;
while (pinsTomados.has(String(pin))) pin++;

const { data, error } = await sb.from("team_members").insert({
  nombre: "Nicolás",
  etiqueta: "nicolas",
  rol: "admin",
  email: null,
  is_admin: true,
  is_closer: true,
  is_setter: false,
  is_cobranzas: false,
  is_seguimiento: false,
  comision_pct: 10,
  pin: String(pin),
  activo: true,
  observaciones: "Socio política — admin + closer",
}).select("id, nombre, pin").single();

if (error) {
  console.log(`✗ ERROR: ${error.message}`);
  process.exit(1);
}

console.log(`✓ ${data.nombre} creado | PIN: ${data.pin} | id: ${data.id.slice(0, 8)}`);
console.log(`\nURL: https://politica.crm.backstagge.com/login`);
console.log(`Usuario: Nicolás   PIN: ${data.pin}`);
