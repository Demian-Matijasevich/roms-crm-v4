/**
 * Aplica los accionables del diff Excel vs DB (decididos manualmente):
 *
 * 1. INSERTAR c#1 pagado:
 *    - German Pinteño  $100  (14/01/2026)
 *    - Arevalo Arevalo $150  (20/01/2026)
 *
 * 2. UPDATE c#1 existente a PAGADO:
 *    - Mariano Forastieri c#1 $18.000 (fecha pago 16/03/2026, receptor JUANMA ya cargado)
 *
 * 3. SKIP:
 *    - Tony Zagan (ya está bajo "Mauricio y Tony Zagan")
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp","utf8").split("\n").filter(l=>l.includes("="))
    .map(l=>{const[k,...v]=l.split("=");return[k.trim(),v.join("=").trim().replace(/^"/,"").replace(/"$/,"").replace(/\\n$/,"")];})
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const inserts = [
  { nombre: "German Pinteño", monto: 100, fecha: "2026-01-14" },
  { nombre: "Arevalo Arevalo", monto: 150, fecha: "2026-01-20" },
];

const updates = [
  { nombre: "Mariano Forastieri", monto: 18000, fecha_pago: "2026-03-16" },
];

const log = (msg) => console.log(msg);

// ── INSERTS c#1 pagado ──
log("\n# INSERTS c#1 pagado");
for (const it of inserts) {
  const { data: leads } = await sb.from("leads").select("id, nombre").ilike("nombre", `%${it.nombre}%`);
  if (!leads || leads.length === 0) { log(`  ✗ ${it.nombre}: no encontrado`); continue; }
  if (leads.length > 1) { log(`  ⚠ ${it.nombre}: ${leads.length} matches, skip`); continue; }
  const lead = leads[0];

  // Verificar no exista ya c#1 pagado
  const { data: exist } = await sb.from("payments").select("id").eq("lead_id", lead.id).eq("numero_cuota", 1).eq("estado", "pagado");
  if (exist && exist.length > 0) { log(`  ⊘ ${lead.nombre}: ya tiene c#1 pagada, skip`); continue; }

  const { error } = await sb.from("payments").insert({
    lead_id: lead.id,
    numero_cuota: 1,
    monto_usd: it.monto,
    monto_ars: 0,
    estado: "pagado",
    fecha_pago: it.fecha,
    receptor: "Import Excel (Mati)",
    es_renovacion: false,
    verificado: false,
  });
  if (error) log(`  ✗ ${lead.nombre}: ERROR ${error.message}`);
  else log(`  ✓ ${lead.nombre}: c#1 $${it.monto} ${it.fecha}`);
}

// ── UPDATES c#1 pendiente → pagado ──
log("\n# UPDATES (cambiar c#1 pendiente a pagado)");
for (const up of updates) {
  const { data: leads } = await sb.from("leads").select("id, nombre").ilike("nombre", `%${up.nombre}%`);
  if (!leads || leads.length !== 1) { log(`  ⚠ ${up.nombre}: ${leads?.length || 0} matches, skip`); continue; }
  const lead = leads[0];

  const { data: pays } = await sb.from("payments").select("id, monto_usd, estado, fecha_pago")
    .eq("lead_id", lead.id).eq("numero_cuota", 1);
  if (!pays || pays.length === 0) { log(`  ⚠ ${lead.nombre}: no tiene c#1, skip`); continue; }

  const c1 = pays[0];
  if (c1.estado === "pagado") { log(`  ⊘ ${lead.nombre}: c#1 ya pagado, skip`); continue; }
  if (Math.abs(Number(c1.monto_usd) - up.monto) > 1) {
    log(`  ⚠ ${lead.nombre}: monto difiere DB=$${c1.monto_usd} Excel=$${up.monto}, skip por seguridad`);
    continue;
  }

  const { error } = await sb.from("payments").update({
    estado: "pagado",
    fecha_pago: up.fecha_pago,
  }).eq("id", c1.id);
  if (error) log(`  ✗ ${lead.nombre}: ERROR ${error.message}`);
  else log(`  ✓ ${lead.nombre}: c#1 $${c1.monto_usd} → pagado (${up.fecha_pago})`);
}

log("\n✅ Hecho");
