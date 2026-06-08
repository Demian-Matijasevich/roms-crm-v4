/**
 * Chequea los 3 políticos que ya existían (Rodrigo de Loredo, Alberto Weretilneck,
 * Santiago Pinsiroli) y si están en nicho general → los migra a política con etapa nuevo.
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

const nombres = ["Rodrigo de Loredo", "Alberto Weretilneck", "Santiago Pinsiroli"];

for (const nombre of nombres) {
  console.log(`\n═══ ${nombre} ═══`);
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, nicho, estado, etapa_politica, closer_id, fecha_llamada, programa_pitcheado, ticket_total, created_at")
    .ilike("nombre", `%${nombre}%`);

  if (!leads || leads.length === 0) {
    console.log("  (no match — capaz fuzzy distinto)");
    continue;
  }

  for (const l of leads) {
    console.log(`  ${l.nombre} | nicho=${l.nicho} | estado=${l.estado} | etapa_pol=${l.etapa_politica || "—"} | ticket=$${l.ticket_total} | prog=${l.programa_pitcheado || "—"} | created=${l.created_at?.slice(0, 10)}`);

    // Si está en general → migrar a política con etapa nuevo (manteniendo lo demás)
    if (l.nicho !== "politica") {
      const updates = { nicho: "politica" };
      if (!l.etapa_politica) updates.etapa_politica = "nuevo";
      const { error } = await sb.from("leads").update(updates).eq("id", l.id);
      if (error) {
        console.log(`    ✗ ERROR migrando: ${error.message}`);
      } else {
        console.log(`    ✓ Migrado a política${updates.etapa_politica ? " + etapa nuevo" : ""}`);
      }
    } else {
      console.log(`    ⊘ ya está en política, sin cambios`);
    }
  }
}
