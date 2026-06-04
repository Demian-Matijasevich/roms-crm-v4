/**
 * Crea team_members para Seba y Nacho (equipo política).
 * Genera PINs distintos y verifica que no choquen con existentes.
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

// Verificar PINs existentes
const { data: existing } = await sb.from("team_members").select("nombre, pin");
const pinsTomados = new Set((existing || []).map((m) => m.pin).filter(Boolean));
const nombresTomados = new Set((existing || []).map((m) => m.nombre?.toLowerCase()).filter(Boolean));

console.log("PINs ya tomados:", Array.from(pinsTomados).sort());

function pickPin(start) {
  let n = start;
  while (pinsTomados.has(String(n))) n++;
  pinsTomados.add(String(n));
  return String(n);
}

const usuarios = [
  { nombre: "Seba", etiqueta: "seba", rol: "closer", pin: pickPin(1004) },
  { nombre: "Nacho", etiqueta: "nacho", rol: "closer", pin: pickPin(1005) },
];

for (const u of usuarios) {
  if (nombresTomados.has(u.nombre.toLowerCase())) {
    console.log(`⚠ ${u.nombre}: ya existe — skipeo. Si querés resetear PIN, hacelo manual.`);
    continue;
  }
  const { data, error } = await sb.from("team_members").insert({
    nombre: u.nombre,
    etiqueta: u.etiqueta,
    rol: u.rol,
    email: null,
    is_admin: false,
    is_closer: true,
    is_setter: false,
    is_cobranzas: false,
    is_seguimiento: false,
    comision_pct: 10,
    pin: u.pin,
    activo: true,
    observaciones: "Equipo política — alta automática 2026-06-04",
  }).select("id, nombre, pin").single();

  if (error) {
    console.log(`✗ ${u.nombre}: ERROR ${error.message}`);
  } else {
    console.log(`✓ ${data.nombre} creado | PIN: ${data.pin} | id: ${data.id.slice(0, 8)}`);
  }
}

console.log("\n══════════════════════════════════════");
console.log("CREDENCIALES PARA EL EQUIPO POLÍTICA");
console.log("══════════════════════════════════════");
for (const u of usuarios) {
  console.log(`  ${u.nombre.padEnd(8)} → PIN: ${u.pin}`);
}
console.log("\nURL: https://politica.crm.backstagge.com/login");
console.log("Usuario = nombre exacto (case sensitive).");
