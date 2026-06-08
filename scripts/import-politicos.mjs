/**
 * Importa la lista inicial de políticos al CRM con:
 *   nicho = politica
 *   etapa_politica = nuevo (van a la bandeja entrada del kanban)
 *   estado = pendiente
 *   closer_id = null (sin asignar — Seba/Nacho/Nicolás los toman desde el board)
 *
 * Skipea si ya existe lead con mismo nombre normalizado.
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

// Cargo conocido (best-effort, el equipo lo confirma/edita)
const POLITICOS = [
  { nombre: "Manuel Passaglia",       cargo: "Diputado provincial / ex intendente San Nicolás (Bs As)" },
  { nombre: "Rodrigo de Loredo",      cargo: "Diputado nacional UCR — Córdoba" },
  { nombre: "Daniel Passerini",       cargo: "Intendente Córdoba Capital" },
  { nombre: "Pilar Ramírez",          cargo: "Legisladora porteña CABA — LLA" },
  { nombre: "Nacho Torres",           cargo: "Gobernador de Chubut" },
  { nombre: "Alberto Weretilneck",    cargo: "Gobernador de Río Negro" },
  { nombre: "Maximiliano Pullaro",    cargo: "Gobernador de Santa Fe" },
  { nombre: "Franco Tartagal",        cargo: "Por confirmar" },
  { nombre: "Omar Exeni",             cargo: "Por confirmar" },
  { nombre: "Santiago Pinsiroli",     cargo: "Por confirmar" },
  { nombre: "Magno Álvarez",          cargo: "Por confirmar" },
];

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Cargo todos los leads existentes para evitar duplicados
const { data: existing } = await sb.from("leads").select("id, nombre").range(0, 19999);
const yaCargados = new Set((existing || []).map((l) => normName(l.nombre)));

console.log(`📋 Importando ${POLITICOS.length} políticos al CRM...\n`);

let creados = 0;
let saltados = 0;
let errores = 0;
const now = new Date().toISOString().slice(0, 10);

for (const p of POLITICOS) {
  if (yaCargados.has(normName(p.nombre))) {
    console.log(`⊘ ${p.nombre} — ya existe en DB, skip`);
    saltados++;
    continue;
  }

  const lead = {
    nombre: p.nombre,
    nicho: "politica",
    etapa_politica: "nuevo",
    estado: "pendiente",
    closer_id: null,
    setter_id: null,
    fuente: "otro",
    de_donde_viene_lead: "Carga manual política — alta inicial",
    contexto_setter: `Cargo: ${p.cargo}`,
    notas_internas: `[Importado ${now}] Político del listado inicial. Cargo (por confirmar): ${p.cargo}`,
    ticket_total: 0,
    etiquetas: [],
    fue_seguimiento: false,
  };

  const { data, error } = await sb.from("leads").insert(lead).select("id, nombre").single();
  if (error) {
    console.log(`✗ ${p.nombre}: ERROR ${error.message}`);
    errores++;
    continue;
  }

  // Activity log: alta inicial
  await sb.from("lead_activity").insert({
    lead_id: data.id,
    actor_nombre: "Sistema (import inicial)",
    tipo: "other",
    mensaje: `Alta inicial — ${p.cargo}`,
  });

  console.log(`✓ ${p.nombre.padEnd(28)} | ${p.cargo}`);
  creados++;
}

console.log(`\n══════════════════════════════════════`);
console.log(`✅ Creados:  ${creados}`);
console.log(`⊘ Saltados: ${saltados}`);
console.log(`❌ Errores:  ${errores}`);
console.log(`\nVer en: https://politica.crm.backstagge.com/pipeline`);
