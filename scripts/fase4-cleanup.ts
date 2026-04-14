import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes("--apply");

const BASURA_IDS = [
  "010aafbf", // Sinziana Lacob $18000 02/03
  "f96963bf", // Sinziana Lacob $18000 sin fecha
  "fef79a2a", // Valentina $1000 27/02
  "f1e793a8", // Valentina $1000 sin fecha
  "e70e71a5", // Valentina $17000 sin fecha
  "edb356b4", // Javi Cuman $7000 13/01
  "3e943d12", // Javi Cuman $30000 sin fecha
  "7a5f25f3", // Mariano Leonel $8000 c2 sin fecha
  "29d7e88c", // Mariano Leonel $3000 c3 sin fecha
  "0f590e23", // Mariano Leonel $8000 c1 02/03
  "7fdfc9b0", // Gabriela Kelly Castro $3000 03/02
  "7e8c7ad2", // Gabriela Kelly Castro $3000 sin fecha
  "23d2c70b", // Gabriela Kelly Castro $3000 26/01
  "cd82eb60", // Tomas Fernandez $534 sin fecha
  "e39d47a1", // Natalia Oltmann $244
  "b9a990f4", // Natalia Oltmann $266
];

const DUDOSOS_IDS = [
  "1a55b206", // Jorge $500 31/03
  "b5f35052", // Nicolas delgado $300 18/03
  "29f13c50", // Emilia Lopez $300 12/02
  "4baa821a", // Alejandra Vargas $500 10/03
  "a472927f", // Esteban Gerrard $500 31/03
  "e9d76d99", // Javier Bellinzona $500 23/02
  "42fd26f4", // FEDERICO LEZCANO $6000 24/02
  "e45e67df", // sebastian guemdjan $12000 05/02
  "0baedfd3", // Rodrigo Machado $1000 03/02
  "484ec672", // Jose Fernandez $7000 29/01
  "a96138b7", // Carola Moran $3000 21/01
  "0f1bc74e", // Guido Martin Piñeiro $18000 18/01
  "d5bb880a", // Esteban Gonzalez $30000 23/02
  "1f34ea8c", // Tomas Fernandez $534 16/03
];

async function main() {
  // 1) Fetch actual IDs (we only have prefixes)
  const { data: basura } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, lead:leads!payments_lead_id_fkey(id, nombre)")
    .range(0, 4999);

  const toDelete = (basura || []).filter((p) => BASURA_IDS.includes(p.id.substring(0, 8)));
  console.log(`🗑️  BASURA a borrar: ${toDelete.length}/${BASURA_IDS.length}`);
  for (const p of toDelete) console.log(`   ${(p.lead as any)?.nombre || "—"} $${p.monto_usd}`);

  const toMark = (basura || []).filter((p) => DUDOSOS_IDS.includes(p.id.substring(0, 8)));
  console.log(`\n⚠️  DUDOSOS a marcar en lead: ${toMark.length}/${DUDOSOS_IDS.length}`);
  const leadsDudosos = new Map<string, string[]>();
  for (const p of toMark) {
    const lead = p.lead as any;
    if (!lead) continue;
    const note = `$${p.monto_usd} ${p.fecha_pago?.split("T")[0] || "sin fecha"}`;
    if (!leadsDudosos.has(lead.id)) leadsDudosos.set(lead.id, []);
    leadsDudosos.get(lead.id)!.push(note);
  }
  for (const [leadId, notes] of leadsDudosos.entries()) {
    const lead = (basura || []).find((p) => (p.lead as any)?.id === leadId)?.lead as any;
    console.log(`   ${lead?.nombre}: ${notes.join(", ")}`);
  }

  if (!APPLY) { console.log("\n(dry run)"); return; }

  console.log("\n🚀 Aplicando...");

  // Delete basura
  for (const p of toDelete) {
    await sb.from("payments").delete().eq("id", p.id);
    console.log(`  ✓ deleted ${(p.lead as any)?.nombre} $${p.monto_usd}`);
  }

  // Mark dudosos — append to lead notas_internas
  for (const [leadId, notes] of leadsDudosos.entries()) {
    const { data: currentLead } = await sb.from("leads").select("notas_internas").eq("id", leadId).single();
    const existing = currentLead?.notas_internas || "";
    const mark = `⚠️ PAGO DUDOSO (revisar): ${notes.join(", ")}`;
    const newNotes = existing.includes("PAGO DUDOSO") ? existing : (existing ? `${existing}\n${mark}` : mark);
    await sb.from("leads").update({ notas_internas: newNotes }).eq("id", leadId);
    console.log(`  ✓ marked ${leadId.substring(0, 8)}`);
  }

  console.log("\n✅ Fase 4 completa");
}

main().catch(console.error);
