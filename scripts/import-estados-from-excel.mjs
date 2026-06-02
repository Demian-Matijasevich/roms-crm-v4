/**
 * Import estados desde Excel a la DB.
 *
 * Para cada fila del Excel con "Nombre" + "Situación" / "¿Se presentó?":
 *   1. Busca el lead en DB por nombre (case-insensitive trim, fuzzy)
 *   2. Si match exacto 1, actualiza
 *   3. Si 0 matches o >1, reporta
 *
 * Mapeo Situación → lead.estado:
 *   "Seguimiento"            → seguimiento
 *   "No se cerró"            → no_cierre
 *   "Adentro en Seguimiento" → adentro_seguimiento
 *   "Reagendado"             → reprogramada
 *   "Canceló"                → cancelada
 *   "No agendó"              → no_show
 *   "Fee"                    → cerrado
 *   "Adentro en Llamada"     → cerrado
 *
 * Mapeo ¿Se presentó? → lead.se_presento:
 *   "Si" → si | "No" → no | "Cancelado" → cancelado
 *
 * Modo dry-run por default: pasá --apply para escribir.
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE.xlsx");
const wb = XLSX.read(buf);
const ws = wb.Sheets["CRM Agendas"];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

const SITUACION_MAP = {
  "Seguimiento": "seguimiento",
  "No se cerró": "no_cierre",
  "Adentro en Seguimiento": "adentro_seguimiento",
  "Reagendado": "reprogramada",
  "Canceló": "cancelada",
  "No agendó": "no_show",
  "Fee": "cerrado",
  "Adentro en Llamada": "cerrado",
};
const SE_PRESENTO_MAP = {
  Si: "si",
  No: "no",
  Cancelado: "cancelado",
};

const stats = { matched: 0, no_match: 0, ambiguo: 0, sin_cambios: 0, actualizado: 0, errores: 0 };
const noMatchNames = [];
const ambiguousNames = [];

// Cache: traer todos los leads de la DB para hacer matching local
console.log("Cargando leads de DB...");
const { data: dbLeads } = await sb.from("leads").select("id, nombre, estado, se_presento").range(0, 9999);
console.log(`DB tiene ${dbLeads.length} leads`);

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const dbByName = new Map();
for (const l of dbLeads) {
  const k = normName(l.nombre);
  if (!k) continue;
  if (!dbByName.has(k)) dbByName.set(k, []);
  dbByName.get(k).push(l);
}

// Procesar cada fila del Excel
for (const r of rows) {
  const nombreExcel = String(r["Nombre"] || "").trim();
  if (!nombreExcel) continue;
  const sit = String(r["Situación"] || "").trim();
  const sp = String(r["¿Se presentó?"] || "").trim();
  if (!sit && !sp) continue;

  const targetEstado = SITUACION_MAP[sit] || null;
  const targetSP = SE_PRESENTO_MAP[sp] || null;

  if (!targetEstado && !targetSP) continue;

  // Buscar match en DB
  const key = normName(nombreExcel);
  let matches = dbByName.get(key) || [];

  if (matches.length === 0) {
    // Fuzzy: por palabras
    const words = key.split(" ").filter((w) => w.length >= 4);
    if (words.length >= 2) {
      // Match si todas las palabras aparecen en el nombre DB
      matches = dbLeads.filter((l) => {
        const ln = normName(l.nombre);
        return words.every((w) => ln.includes(w));
      });
    }
  }

  if (matches.length === 0) {
    stats.no_match++;
    noMatchNames.push(nombreExcel);
    continue;
  }
  if (matches.length > 1) {
    stats.ambiguo++;
    ambiguousNames.push(`${nombreExcel} (${matches.length} matches)`);
    continue;
  }

  // 1 match exacto
  const lead = matches[0];
  stats.matched++;
  const patch = {};
  if (targetEstado && targetEstado !== lead.estado) patch.estado = targetEstado;
  if (targetSP && targetSP !== lead.se_presento) patch.se_presento = targetSP;
  if (Object.keys(patch).length === 0) {
    stats.sin_cambios++;
    continue;
  }

  if (APPLY) {
    const { error } = await sb.from("leads").update(patch).eq("id", lead.id);
    if (error) {
      stats.errores++;
      console.log(`ERR ${lead.nombre}: ${error.message}`);
    } else {
      stats.actualizado++;
    }
  } else {
    stats.actualizado++;
    if (stats.actualizado <= 30) {
      console.log(`  ${lead.nombre}: ${Object.entries(patch).map(([k, v]) => `${k}=${lead[k] || "(null)"} → ${v}`).join(", ")}`);
    }
  }
}

console.log("\n=== STATS ===");
console.log(stats);
console.log(`\nNo-match (${noMatchNames.length}):`);
for (const n of noMatchNames.slice(0, 15)) console.log(`  • ${n}`);
if (noMatchNames.length > 15) console.log(`  + ${noMatchNames.length - 15} más`);
console.log(`\nAmbiguos (${ambiguousNames.length}):`);
for (const n of ambiguousNames.slice(0, 10)) console.log(`  • ${n}`);

console.log("");
console.log(APPLY ? "✅ APLICADO" : "📋 DRY RUN — pasá --apply para escribir en DB");
