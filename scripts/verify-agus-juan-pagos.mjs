/**
 * Verifica uno por uno los pagos detectados en AGUS OLIVERO y JUAN BLANCO
 * que el script principal no agarra (NO_MATCH, FALTA_C1, AMBIGUO).
 *
 * Lista para cada nombre: el lead actual en DB, sus payments, y decide si hay que insertar o crear.
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

const targets = [
  // AGUS — 5 pagos
  { hoja: "AGUS OLIVERO", nombre: "Fernanda Márquez", cashD1: 3000, cashTrato: 3000, fechaPago: "2026-04-14", closer: "Agustin" },
  { hoja: "AGUS OLIVERO", nombre: "Griselda Perier", cashD1: 5000, cashTrato: 20000, fechaPago: "2026-04-16", closer: "Agustin" },
  { hoja: "AGUS OLIVERO", nombre: "Fernando Villalobos", cashD1: 3000, cashTrato: 10000, fechaPago: "2026-05-29", closer: "Agustin" },
  { hoja: "AGUS OLIVERO", nombre: "Rodrigo Perez", cashD1: 1000, cashTrato: 0, fechaPago: "2026-05-02", closer: "Agustin" },
  { hoja: "AGUS OLIVERO", nombre: "Fabricio Martinez (consultoria)", cashD1: 0, cashTrato: 4000, fechaPago: "2026-06-01", closer: "Agustin" },

  // JUAN BLANCO — 11 pagos
  { hoja: "JUAN BLANCO", nombre: "Ariel Leguiza", cashD1: 100, cashTrato: 0, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Matt Romig", cashD1: 0, cashTrato: 3500, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Erick Luna Aguilar", cashD1: 0, cashTrato: 1800, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Noelia Conde", cashD1: 0, cashTrato: 1200, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Felipe Cortés", cashD1: 0, cashTrato: 2000, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Alberto Zubiaurre", cashD1: 0, cashTrato: 1200, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Francisca Costanzo", cashD1: 0, cashTrato: 7000, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Tatiana Dragonetti", cashD1: 0, cashTrato: 10000, fechaPago: "2026-05-05", closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Romina Marquez", cashD1: 0, cashTrato: 6000, fechaPago: "2026-05-05", closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "SIlvana Paje", cashD1: 0, cashTrato: 1200, fechaPago: null, closer: "Juan Blanco" },
  { hoja: "JUAN BLANCO", nombre: "Angela CIcenia", cashD1: 0, cashTrato: 1800, fechaPago: null, closer: "Juan Blanco" },
];

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const { data: dbLeads } = await sb.from("leads").select("id, nombre, estado, closer_id, ticket_total, programa_pitcheado").range(0, 9999);

for (const t of targets) {
  console.log(`\n═══════════════════════════════════════`);
  console.log(`[${t.hoja}] ${t.nombre}`);
  console.log(`  Cash D1=$${t.cashD1} | Trato=$${t.cashTrato} | FechaPago=${t.fechaPago || "—"}`);

  // Múltiples estrategias de match
  // 1) Exacto normalizado
  const keyNorm = normName(t.nombre);
  // 2) Sin paréntesis
  const keyNoParens = normName(t.nombre.replace(/\([^)]*\)/g, ""));
  // 3) Palabras significativas
  const words = keyNoParens.split(" ").filter((w) => w.length >= 4);

  const matches = dbLeads.filter((l) => {
    const ln = normName(l.nombre);
    if (ln === keyNorm) return true;
    if (ln === keyNoParens) return true;
    if (words.length >= 2 && words.every((w) => ln.includes(w))) return true;
    return false;
  });

  if (matches.length === 0) {
    console.log(`  ❌ NO EXISTE en DB — habría que CREAR el lead`);
    continue;
  }

  for (const m of matches) {
    console.log(`  ✅ Match: ${m.nombre} (id=${m.id.slice(0, 8)}) estado=${m.estado} ticket=$${m.ticket_total} prog=${m.programa_pitcheado || "—"}`);
    const { data: pays } = await sb.from("payments").select("numero_cuota, monto_usd, estado, fecha_pago, fecha_vencimiento, es_renovacion, receptor").eq("lead_id", m.id).order("numero_cuota");
    if (!pays || pays.length === 0) {
      console.log(`     (sin payments en DB)`);
    } else {
      for (const p of pays) {
        console.log(`     c#${p.numero_cuota} $${p.monto_usd} ${p.estado} fechaPago=${p.fecha_pago || "—"} venc=${p.fecha_vencimiento || "—"} renov=${p.es_renovacion}`);
      }
    }
  }
}
