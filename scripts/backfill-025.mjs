import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── Backfill se_presento ──
// Mapeo:
//   no_show         → no
//   cancelada       → cancelado
//   reprogramada    → cancelado (avisó antes)
//   pendiente       → null (aún no se presentó)
//   seguimiento, no_calificado, no_cierre, reserva, cerrado, adentro_seguimiento, broke_cancelado → si
const mapeo = {
  no_show: "no",
  cancelada: "cancelado",
  reprogramada: "cancelado",
  seguimiento: "si",
  no_calificado: "si",
  no_cierre: "si",
  reserva: "si",
  cerrado: "si",
  adentro_seguimiento: "si",
  broke_cancelado: "si",
};

console.log("=== Backfill se_presento ===");
let total = 0;
for (const [estado, sePresento] of Object.entries(mapeo)) {
  const { data, error, count } = await sb
    .from("leads")
    .update({ se_presento: sePresento })
    .eq("estado", estado)
    .is("se_presento", null)
    .select("id", { count: "exact", head: true });
  if (error) {
    console.error(`  ${estado}: ERROR ${error.message}`);
    continue;
  }
  console.log(`  ${estado.padEnd(22)} → se_presento=${sePresento}: ${count || 0} leads`);
  total += count || 0;
}
console.log(`TOTAL actualizados: ${total}`);

// ── Backfill cerrado_en_llamada ──
// Si lead.estado=cerrado AND existe payment c1 con fecha_pago === fecha_llamada → true
// Si lead.estado=cerrado AND fecha_pago > fecha_llamada → false (cerrado en seguimiento)
console.log("\n=== Backfill cerrado_en_llamada ===");
const { data: cerrados } = await sb
  .from("leads")
  .select("id, fecha_llamada")
  .eq("estado", "cerrado")
  .is("cerrado_en_llamada", null);

console.log(`Cerrados sin flag: ${cerrados?.length || 0}`);

let enLlamada = 0;
let enSeguimiento = 0;
let sinDato = 0;
for (const lead of cerrados || []) {
  const { data: pagos } = await sb
    .from("payments")
    .select("fecha_pago, numero_cuota, estado")
    .eq("lead_id", lead.id)
    .eq("estado", "pagado")
    .order("numero_cuota", { ascending: true });
  const c1 = (pagos || []).find((p) => p.numero_cuota === 1);
  if (!c1 || !lead.fecha_llamada || !c1.fecha_pago) {
    sinDato++;
    continue;
  }
  const fechaLlamada = lead.fecha_llamada.slice(0, 10);
  const fechaPago = c1.fecha_pago.slice(0, 10);
  // Cerró en llamada si la fecha de pago es el mismo día o 1 día después (margen razonable)
  const diff = Math.abs(new Date(fechaPago) - new Date(fechaLlamada)) / (1000 * 60 * 60 * 24);
  const cerradoEnLlamada = diff <= 1;
  await sb.from("leads").update({ cerrado_en_llamada: cerradoEnLlamada }).eq("id", lead.id);
  if (cerradoEnLlamada) enLlamada++;
  else enSeguimiento++;
}
console.log(`  Cerrados EN LLAMADA: ${enLlamada}`);
console.log(`  Cerrados EN SEGUIMIENTO: ${enSeguimiento}`);
console.log(`  Sin dato suficiente: ${sinDato}`);

// ── Verificación ──
console.log("\n=== Verificación post-backfill ===");
const { count: totalLeads } = await sb.from("leads").select("*", { count: "exact", head: true });
const { count: conSePresento } = await sb
  .from("leads")
  .select("*", { count: "exact", head: true })
  .not("se_presento", "is", null);
console.log(`Total leads: ${totalLeads}, con se_presento: ${conSePresento}`);

for (const v of ["si", "no", "cancelado"]) {
  const { count } = await sb.from("leads").select("*", { count: "exact", head: true }).eq("se_presento", v);
  console.log(`  se_presento=${v}: ${count}`);
}

const { count: cerradoSi } = await sb.from("leads").select("*", { count: "exact", head: true }).eq("cerrado_en_llamada", true);
const { count: cerradoNo } = await sb.from("leads").select("*", { count: "exact", head: true }).eq("cerrado_en_llamada", false);
console.log(`Cerrado en llamada (sí): ${cerradoSi}`);
console.log(`Cerrado en seguimiento: ${cerradoNo}`);
