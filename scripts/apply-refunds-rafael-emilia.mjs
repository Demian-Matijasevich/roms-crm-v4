/**
 * Aplica 2 refunds del mes de mayo 2026:
 *
 *   1. Rafael Porras   — $8.200    fecha 2026-05-20
 *   2. Emilia Lopez    — $13.991,46 (lead Martin Miño)
 *      Refund real fue en junio pero descuenta comisiones de mayo —
 *      por eso fecha_pago=2026-05-31 (último día de mayo).
 *
 * El sistema calcula automáticamente el descuento de comisión closer (% según
 * programa) + setter (3%) si los campos se dejan en 0.
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

const APPLY = process.argv.includes("--apply");

const REFUNDS = [
  {
    nombre_busqueda: "Rafael Porras",
    monto: 8200,
    fecha_pago: "2026-05-20",
    motivo: "refund mayo (Rafael Porras)",
  },
  {
    // Cliente Emilia Lopez está bajo el lead "Martin Miño"
    nombre_busqueda: "Martin Miño",
    cliente_real: "Emilia Lopez",
    monto: 13991.46,
    fecha_pago: "2026-05-31",
    motivo: "refund Emilia Lopez (descuenta comisiones de mayo - refund real en junio)",
  },
];

console.log("══════════════════════════════════════");
console.log(APPLY ? "APLICANDO REFUNDS..." : "DRY RUN — verificación previa");
console.log("══════════════════════════════════════\n");

for (const r of REFUNDS) {
  console.log(`\n── ${r.nombre_busqueda}${r.cliente_real ? ` (cliente: ${r.cliente_real})` : ""} ──`);
  console.log(`   Monto: $${r.monto.toLocaleString()} | Fecha pago: ${r.fecha_pago}`);

  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, closer_id, setter_id, programa_pitcheado, ticket_total, estado, closer:team_members!leads_closer_id_fkey(nombre), setter:team_members!leads_setter_id_fkey(nombre)")
    .ilike("nombre", `%${r.nombre_busqueda}%`);

  if (!leads || leads.length === 0) {
    console.log("   ✗ Lead NO ENCONTRADO");
    continue;
  }
  if (leads.length > 1) {
    console.log(`   ⚠ ${leads.length} leads match — usando el primero:`);
    leads.forEach((l) => console.log(`     - ${l.nombre} (id=${l.id.slice(0, 8)})`));
  }
  const lead = leads[0];
  console.log(`   Lead: ${lead.nombre} (id=${lead.id.slice(0, 8)})`);
  console.log(`   Closer: ${lead.closer?.nombre || "—"}  Setter: ${lead.setter?.nombre || "—"}`);
  console.log(`   Programa: ${lead.programa_pitcheado || "—"}  Ticket: $${lead.ticket_total}`);

  // Verificar si ya hay un refund por este monto y fecha
  const { data: existing } = await sb
    .from("payments")
    .select("id, monto_usd, estado, fecha_pago, receptor")
    .eq("lead_id", lead.id)
    .eq("estado", "refund");
  if (existing && existing.length > 0) {
    const dup = existing.find((p) => Math.abs(Number(p.monto_usd) - r.monto) < 1 && p.fecha_pago === r.fecha_pago);
    if (dup) {
      console.log(`   ⊘ YA EXISTE refund (id=${dup.id.slice(0, 8)}) — skip`);
      continue;
    }
    console.log(`   ℹ Otros refunds existentes:`);
    existing.forEach((p) => console.log(`     - $${p.monto_usd} ${p.fecha_pago} ${p.receptor || ""}`));
  }

  // Mostrar comisiones que se le iban a pagar (info)
  const { data: pagosCobrados } = await sb
    .from("payments")
    .select("monto_usd, fecha_pago, estado, numero_cuota")
    .eq("lead_id", lead.id)
    .eq("estado", "pagado")
    .order("fecha_pago");
  if (pagosCobrados && pagosCobrados.length > 0) {
    console.log(`   Pagos cobrados al lead:`);
    pagosCobrados.forEach((p) => console.log(`     - c#${p.numero_cuota} $${p.monto_usd} ${p.fecha_pago}`));
  }

  if (!APPLY) {
    console.log(`   [DRY] Insertaría: payments INSERT estado=refund monto=${r.monto} fecha_pago=${r.fecha_pago} receptor='${r.motivo}'`);
    continue;
  }

  const { data: inserted, error } = await sb
    .from("payments")
    .insert({
      lead_id: lead.id,
      client_id: null,
      renewal_id: null,
      numero_cuota: 1,
      monto_usd: r.monto,
      monto_ars: 0,
      fecha_pago: r.fecha_pago,
      fecha_vencimiento: null,
      estado: "refund",
      metodo_pago: null,
      receptor: r.motivo,
      comprobante_url: null,
      cobrador_id: null,
      verificado: false,
      es_renovacion: false,
      // Dejamos los descuentos en 0 — el cálculo automático en /comisiones
      // aplicará: closer = monto × pct (según programa), setter = monto × 3%.
      descuento_comision_closer_usd: 0,
      descuento_comision_setter_usd: 0,
    })
    .select("id, monto_usd, fecha_pago")
    .single();

  if (error) {
    console.log(`   ✗ ERROR: ${error.message}`);
    continue;
  }
  console.log(`   ✓ INSERT OK — payment id=${inserted.id.slice(0, 8)} $${inserted.monto_usd} ${inserted.fecha_pago}`);
}

console.log("\n══════════════════════════════════════");
if (!APPLY) console.log("📋 DRY RUN — pasá --apply para aplicar");
else console.log("✅ Refunds aplicados");
