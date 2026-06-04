/**
 * Aplica la migración 031_etapa_politica.sql via Supabase API.
 */
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);

const sql = readFileSync("supabase/migrations/031_etapa_politica.sql", "utf8");

// Supabase no expone un endpoint SQL puro; usamos pg con un connection string si está,
// sino el truco es ejecutar uno por uno via PostgREST rpc.
// Para simplificar: ejecutar las sentencias una por una via /pg endpoint usando service key
// como cliente normal con node-postgres.
//
// Plan B: usar fetch a la API /rest/v1/rpc/sql si existe función custom; sino
// asumimos que el usuario corre la migración desde el SQL editor manualmente.
//
// Acá generamos el SQL listo para copy/paste:
console.log("══ COPIAR Y PEGAR ESTO EN SUPABASE SQL EDITOR ══\n");
console.log(sql);
console.log("\n══════════════════════════════════════════════════\n");
console.log("URL: https://supabase.com/dashboard/project/" + env.NEXT_PUBLIC_SUPABASE_URL.split("//")[1].split(".")[0] + "/sql/new");
