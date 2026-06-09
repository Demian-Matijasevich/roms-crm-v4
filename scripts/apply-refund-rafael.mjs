/**
 * Suma un segundo refund de $8.200 al lead Rafael Porras
 * (ya tiene uno de $10.000 del 31/05; este es adicional, del 20/05).
 * Descuenta comisión de mayo a Valen (closer).
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

const LEAD_ID = "3940e81b-0533-47a3-94c5-3be4f3110f5a"; // Rafael Porras
const MONTO = 8200;
const FECHA = "2026-05-20";

const { data: lead } = await sb.from("leads").select("id, nombre, closer_id, closer:team_members!leads_closer_id_fkey(nombre)").eq("id", LEAD_ID).single();
console.log(`Lead: ${lead.nombre} (closer=${lead.closer?.nombre || "—"})`);

const { data: existing } = await sb
  .from("payments")
  .select("id, monto_usd, fecha_pago, estado")
  .eq("lead_id", LEAD_ID)
  .eq("estado", "refund");
const dup = (existing || []).find((p) => p.fecha_pago === FECHA && Math.abs(Number(p.monto_usd) - MONTO) < 1);
if (dup) {
  console.log(`⊘ Refund ya cargado (id=${dup.id.slice(0, 8)}) — skip`);
  process.exit(0);
}

const { data: inserted, error } = await sb
  .from("payments")
  .insert({
    lead_id: LEAD_ID,
    client_id: null,
    numero_cuota: 2, // ya hay uno con c#1
    monto_usd: MONTO,
    monto_ars: 0,
    fecha_pago: FECHA,
    fecha_vencimiento: null,
    estado: "refund",
    metodo_pago: null,
    receptor: "Refund Rafael Porras (adicional al de $10k)",
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
console.log(`\n✅ Total refund de Rafael en mayo: $${10000 + MONTO} (descuenta comisión a Valen)`);
