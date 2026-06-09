/**
 * Aplica refund de Emilia Lopez (lead "Martin Miño"):
 *   - Asigna closer=Valen al lead (faltaba)
 *   - Inserta payment estado=refund $13.991,46 fecha 2026-05-31
 *   - El descuento de comisión se calcula automáticamente con monto × pct del programa
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

const LEAD_ID = "5e67908d-d6fc-48cc-8abb-d50e47151775"; // Martin Miño = cliente Emilia Lopez
const MONTO = 13991.46;
const FECHA = "2026-05-31"; // último día de mayo — descuenta comisiones mayo

// Buscar Valen
const { data: valen } = await sb.from("team_members").select("id, nombre").ilike("nombre", "valentino").maybeSingle();
if (!valen) {
  console.log("✗ Valentino no encontrado en team_members");
  process.exit(1);
}
console.log(`Valen team_member_id: ${valen.id.slice(0, 8)} (${valen.nombre})`);

// Asignar closer al lead
const { data: lead } = await sb.from("leads").select("id, nombre, closer_id").eq("id", LEAD_ID).single();
if (lead.closer_id !== valen.id) {
  await sb.from("leads").update({ closer_id: valen.id }).eq("id", LEAD_ID);
  console.log(`✓ Closer asignado a ${valen.nombre} en lead ${lead.nombre}`);
} else {
  console.log(`⊘ Lead ya tiene closer=Valen`);
}

// Insertar refund
const { data: existing } = await sb
  .from("payments")
  .select("id, monto_usd, fecha_pago, estado")
  .eq("lead_id", LEAD_ID)
  .eq("estado", "refund");
const dup = (existing || []).find((p) => Math.abs(Number(p.monto_usd) - MONTO) < 1);
if (dup) {
  console.log(`⊘ Refund ya cargado (id=${dup.id.slice(0, 8)}) — skip`);
  process.exit(0);
}

const { data: inserted, error } = await sb
  .from("payments")
  .insert({
    lead_id: LEAD_ID,
    client_id: null,
    numero_cuota: 1,
    monto_usd: MONTO,
    monto_ars: 0,
    fecha_pago: FECHA,
    fecha_vencimiento: null,
    estado: "refund",
    metodo_pago: null,
    receptor: "Refund Emilia Lopez (cliente real, lead bajo Martin Miño — descuenta comisiones mayo)",
    comprobante_url: null,
    cobrador_id: null,
    verificado: false,
    es_renovacion: false,
    descuento_comision_closer_usd: 0, // auto-calc
    descuento_comision_setter_usd: 0,
  })
  .select("id, monto_usd, fecha_pago")
  .single();

if (error) {
  console.log(`✗ ERROR: ${error.message}`);
  process.exit(1);
}
console.log(`✓ Refund cargado — id=${inserted.id.slice(0, 8)} $${inserted.monto_usd} ${inserted.fecha_pago}`);
console.log(`\n✅ Listo. El refund descontará comisión a Valen en el cierre de mayo.`);
