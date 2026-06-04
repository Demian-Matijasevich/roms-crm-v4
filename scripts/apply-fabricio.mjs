/**
 * Inserta el único pago que tiene fecha real:
 *   Fabricio Martinez (consultoria) — c#1 $4000 pagado 2026-06-01
 * Lead ya existe en DB (id=bd6f5335...).
 *
 * Los otros 3 candidatos quedaron skipped por orden del user (sin fecha de pago en Excel):
 *   - Ariel Leguiza ($100, sin fecha)
 *   - Erick Luna Aguilar ($1800, sin fecha)
 *   - Francisca Costanzo ($7000, sin fecha)
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

// Buscar el lead "Fabricio Martinez" (sin consultoria)
const { data: leads } = await sb.from("leads").select("id, nombre, estado, ticket_total, programa_pitcheado").ilike("nombre", "%Fabricio%Martinez%");

if (!leads || leads.length === 0) {
  console.log("✗ No se encontró lead Fabricio Martinez");
  process.exit(1);
}
if (leads.length > 1) {
  console.log(`⚠ Hay ${leads.length} matches:`);
  for (const l of leads) console.log(`   ${l.nombre} (id=${l.id.slice(0,8)})`);
  process.exit(1);
}

const lead = leads[0];
console.log(`Lead: ${lead.nombre} (id=${lead.id.slice(0,8)}) estado=${lead.estado} ticket=$${lead.ticket_total}`);

// Verificar no exista ya c#1
const { data: existing } = await sb.from("payments").select("id, numero_cuota, estado, monto_usd").eq("lead_id", lead.id);
if (existing && existing.length > 0) {
  console.log("⚠ El lead ya tiene payments — abortando para evitar duplicado:");
  for (const p of existing) console.log(`   c#${p.numero_cuota} $${p.monto_usd} ${p.estado}`);
  process.exit(1);
}

// Insertar c#1 pagado
const { error } = await sb.from("payments").insert({
  lead_id: lead.id,
  numero_cuota: 1,
  monto_usd: 4000,
  monto_ars: 0,
  estado: "pagado",
  fecha_pago: "2026-06-01",
  receptor: "Import Excel (AGUS OLIVERO)",
  es_renovacion: false,
  verificado: false,
});

if (error) {
  console.log(`✗ ERROR: ${error.message}`);
  process.exit(1);
}

console.log(`✓ INSERT c#1 $4000 pagado 2026-06-01 para ${lead.nombre}`);

// Si el lead no tiene programa o ticket, también seteo programa=consultoria y ticket=4000
if (!lead.ticket_total || lead.ticket_total === 0) {
  const updates = { ticket_total: 4000 };
  if (!lead.programa_pitcheado) updates.programa_pitcheado = "consultoria";
  if (lead.estado !== "cerrado") updates.estado = "cerrado";
  const { error: updErr } = await sb.from("leads").update(updates).eq("id", lead.id);
  if (updErr) console.log(`⚠ No pude actualizar lead: ${updErr.message}`);
  else console.log(`✓ Lead actualizado: ${JSON.stringify(updates)}`);
}

console.log("\n✅ Listo");
