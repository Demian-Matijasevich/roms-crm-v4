import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes("--apply");

// Confirmed duplicates (same person with 2+ leads in DB).
// Merge strategy: keep the one with lowest sheets_row_index (original Sheet row).
const CONFIRMED_DUPS = [
  "Matias Estrin",
  "Jorge Ignacio Quiñonez franco",
];

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function mergeLead(keep: any, drops: any[]) {
  for (const drop of drops) {
    // Move payments
    const { error: err1 } = await sb.from("payments").update({ lead_id: keep.id }).eq("lead_id", drop.id);
    if (err1) console.error(`  ❌ move payments from ${drop.id}: ${err1.message}`);

    // Move daily reports / any other FK — best-effort
    await sb.from("daily_reports").update({ lead_id: keep.id }).eq("lead_id", drop.id);

    // Delete the dup lead
    const { error: err2 } = await sb.from("leads").delete().eq("id", drop.id);
    if (err2) console.error(`  ❌ delete lead ${drop.id}: ${err2.message}`);
    else console.log(`  ✓ merged & deleted ${drop.nombre} (${drop.id.substring(0, 8)})`);
  }
}

async function main() {
  console.log(`Fase 5 — merge leads duplicados ${APPLY ? "(APPLY)" : "(dry)"}\n`);

  for (const name of CONFIRMED_DUPS) {
    const { data: leads } = await sb
      .from("leads")
      .select("id, nombre, estado, fecha_llamada, sheets_row_index, ticket_total")
      .ilike("nombre", `%${name}%`);
    if (!leads || leads.length < 2) {
      console.log(`${name}: ${leads?.length || 0} leads → skip`);
      continue;
    }
    // Strict name match
    const exact = leads.filter((l) => norm(l.nombre) === norm(name));
    const candidates = exact.length >= 2 ? exact : leads;

    // Pick "keep": one with lowest sheets_row_index, then most data (cerrado > pendiente)
    const sorted = [...candidates].sort((a, b) => {
      const aCerrado = a.estado === "cerrado" || a.estado === "adentro_seguimiento" ? 1 : 0;
      const bCerrado = b.estado === "cerrado" || b.estado === "adentro_seguimiento" ? 1 : 0;
      if (aCerrado !== bCerrado) return bCerrado - aCerrado;
      if (a.sheets_row_index && b.sheets_row_index) return a.sheets_row_index - b.sheets_row_index;
      return 0;
    });
    const [keep, ...drops] = sorted;
    console.log(`\n── ${name} ──`);
    console.log(`  KEEP: ${keep.id.substring(0,8)} row:${keep.sheets_row_index} estado:${keep.estado} llamada:${keep.fecha_llamada?.split("T")[0] || "—"} ticket:${keep.ticket_total}`);
    for (const d of drops) console.log(`  DROP: ${d.id.substring(0,8)} row:${d.sheets_row_index} estado:${d.estado} llamada:${d.fecha_llamada?.split("T")[0] || "—"} ticket:${d.ticket_total}`);

    if (APPLY) await mergeLead(keep, drops);
  }

  // Auto-detect generic duplicates from master audit (optional next pass, commented out)
  console.log("\nDone.");
}

main().catch(console.error);
