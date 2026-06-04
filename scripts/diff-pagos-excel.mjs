/**
 * Reporte diff Excel vs DB para pagos / cuotas.
 *
 * Lee CRM Agendas del Excel. Para cada fila con nombre + datos de pago:
 *   - Busca el lead en DB (matching por nombre normalizado)
 *   - Compara:
 *     * Cash Collected Día 1 (Excel) vs payments c#1 pagados en DB
 *     * Monto Restante a Pagar (Excel) vs payments pendientes en DB (suma)
 *
 * Clasifica cada lead:
 *   PERFECT       — DB ya tiene todo (no hacer nada)
 *   FALTA_C1      — Excel dice cash D1 pero DB no tiene c1 pagada
 *   FALTA_CUOTAS  — Excel dice monto restante pero DB no tiene pendientes
 *   DIFF          — Hay pagos en ambos pero los montos no cuadran (revisar a mano)
 *   NO_MATCH      — El lead no existe en DB
 *
 * Usage:
 *   node scripts/diff-pagos-excel.mjs           → dry run (reporte)
 *   node scripts/diff-pagos-excel.mjs --apply   → inserta los FALTA_C1 y FALTA_CUOTAS
 */

import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE.xlsx");
const wb = XLSX.read(buf);
const ws = wb.Sheets["CRM Agendas"];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function parseMoney(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/[$,.\s]/g, "").replace(/[^\d-]/g, "");
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

// Excel date serial → YYYY-MM-DD
function excelDate(v) {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === "number") {
    // Excel epoch: 1899-12-30
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

console.log("Cargando leads + payments de DB...");
const { data: dbLeads } = await sb.from("leads").select("id, nombre, estado, closer_id, ticket_total").range(0, 9999);
const { data: dbPaymentsRaw } = await sb.from("payments").select("id, lead_id, monto_usd, estado, numero_cuota, fecha_vencimiento, es_renovacion").range(0, 9999);
console.log(`DB: ${dbLeads.length} leads, ${dbPaymentsRaw.length} payments`);

const paymentsByLead = new Map();
for (const p of dbPaymentsRaw) {
  if (!p.lead_id) continue;
  if (!paymentsByLead.has(p.lead_id)) paymentsByLead.set(p.lead_id, []);
  paymentsByLead.get(p.lead_id).push(p);
}

const dbByName = new Map();
for (const l of dbLeads) {
  const k = normName(l.nombre);
  if (!k) continue;
  if (!dbByName.has(k)) dbByName.set(k, []);
  dbByName.get(k).push(l);
}

const stats = {
  perfect: 0,
  falta_c1: 0,
  falta_cuotas: 0,
  diff: 0,
  no_match: 0,
  ambiguo: 0,
  sin_data_excel: 0,
};
const accionables = []; // { tipo, lead, monto, fecha, motivo }

for (const r of rows) {
  const nombre = String(r["Nombre"] || "").trim();
  if (!nombre) continue;

  const cashD1 = parseMoney(r["Cash Collected Día 1"]);
  const cashTrato = parseMoney(r["Cash Collected Trato Cerrado"]);
  const montoRestante = parseMoney(r["Monto Restante a Pagar"]);
  const fechaPago = excelDate(r["Fecha de Pago para Ingreso"]) || excelDate(r["Fecha de Llamada"]);

  if (cashD1 === 0 && montoRestante === 0 && cashTrato === 0) {
    stats.sin_data_excel++;
    continue;
  }

  const key = normName(nombre);
  let matches = dbByName.get(key) || [];

  if (matches.length === 0) {
    const words = key.split(" ").filter((w) => w.length >= 4);
    if (words.length >= 2) {
      matches = dbLeads.filter((l) => {
        const ln = normName(l.nombre);
        return words.every((w) => ln.includes(w));
      });
    }
  }

  if (matches.length === 0) {
    stats.no_match++;
    continue;
  }
  if (matches.length > 1) {
    stats.ambiguo++;
    continue;
  }

  const lead = matches[0];
  const pays = paymentsByLead.get(lead.id) || [];
  const dbC1Pagada = pays.find((p) => p.numero_cuota === 1 && p.estado === "pagado" && !p.es_renovacion);
  const dbPendientes = pays.filter((p) => p.estado === "pendiente");
  const dbPendientesTotal = dbPendientes.reduce((s, p) => s + Number(p.monto_usd || 0), 0);

  let perfect = true;

  // Check Cash Día 1
  if (cashD1 > 0) {
    if (!dbC1Pagada) {
      stats.falta_c1++;
      perfect = false;
      accionables.push({
        tipo: "FALTA_C1",
        lead,
        monto: cashD1,
        fecha: fechaPago,
        motivo: `Excel dice cash D1 $${cashD1.toLocaleString()} pero DB no tiene c#1 pagada`,
      });
    } else if (Math.abs(Number(dbC1Pagada.monto_usd) - cashD1) > 1) {
      stats.diff++;
      perfect = false;
      // No accionamos diff — solo reporte
    }
  }

  // Check Monto Restante (suma de pendientes)
  if (montoRestante > 0) {
    if (dbPendientes.length === 0) {
      stats.falta_cuotas++;
      perfect = false;
      accionables.push({
        tipo: "FALTA_CUOTAS",
        lead,
        monto: montoRestante,
        fecha: fechaPago,
        motivo: `Excel dice monto restante $${montoRestante.toLocaleString()} pero DB no tiene pendientes`,
      });
    } else if (Math.abs(dbPendientesTotal - montoRestante) > 100) {
      stats.diff++;
      perfect = false;
    }
  }

  if (perfect) stats.perfect++;
}

const hr = () => console.log("─".repeat(70));

hr();
console.log("REPORTE DIFF — Excel vs DB");
hr();
console.log("Estados:");
console.log(`  ✅ PERFECT (DB ya tiene todo):       ${stats.perfect}`);
console.log(`  ➕ FALTA_C1 (insertar c1 pagada):     ${stats.falta_c1}`);
console.log(`  ➕ FALTA_CUOTAS (insertar pendientes): ${stats.falta_cuotas}`);
console.log(`  ⚠️  DIFF (montos no cuadran):          ${stats.diff}`);
console.log(`  ❌ NO_MATCH (lead no existe en DB):    ${stats.no_match}`);
console.log(`  ❓ AMBIGUO (varios leads mismo nombre): ${stats.ambiguo}`);
console.log(`  ⊘ SIN_DATA_EXCEL:                     ${stats.sin_data_excel}`);

hr();
console.log("ACCIONABLES (FALTA_C1 + FALTA_CUOTAS):");
hr();
const grouped = { FALTA_C1: [], FALTA_CUOTAS: [] };
for (const a of accionables) grouped[a.tipo].push(a);

console.log(`\n# FALTA_C1 (${grouped.FALTA_C1.length}) — se crearía un payment c#1 pagado:`);
for (const a of grouped.FALTA_C1.slice(0, 25)) {
  console.log(`  • ${a.lead.nombre} (${a.lead.estado}): $${a.monto.toLocaleString()} fecha=${a.fecha || "(today)"}`);
}
if (grouped.FALTA_C1.length > 25) console.log(`  + ${grouped.FALTA_C1.length - 25} más`);

console.log(`\n# FALTA_CUOTAS (${grouped.FALTA_CUOTAS.length}) — se crearía 1 cuota pendiente:`);
for (const a of grouped.FALTA_CUOTAS.slice(0, 25)) {
  console.log(`  • ${a.lead.nombre} (${a.lead.estado}): $${a.monto.toLocaleString()}`);
}
if (grouped.FALTA_CUOTAS.length > 25) console.log(`  + ${grouped.FALTA_CUOTAS.length - 25} más`);

if (!APPLY) {
  hr();
  console.log("📋 DRY RUN — pasá --apply para insertar");
  process.exit(0);
}

// APPLY
hr();
console.log("APLICANDO INSERTS...");
hr();
let okC1 = 0;
let okCuotas = 0;
let errores = 0;
for (const a of accionables) {
  if (a.tipo === "FALTA_C1") {
    const { error } = await sb.from("payments").insert({
      lead_id: a.lead.id,
      numero_cuota: 1,
      monto_usd: a.monto,
      monto_ars: 0,
      estado: "pagado",
      fecha_pago: a.fecha || new Date().toISOString().slice(0, 10),
      receptor: "Import Excel",
      es_renovacion: false,
      verificado: false,
    });
    if (error) {
      errores++;
      console.log(`ERR c1 ${a.lead.nombre}: ${error.message}`);
    } else {
      okC1++;
    }
  } else if (a.tipo === "FALTA_CUOTAS") {
    // Asumimos 1 cuota pendiente con vencimiento +30d desde fecha_pago
    const base = a.fecha || new Date().toISOString().slice(0, 10);
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + 30);
    const vencimiento = d.toISOString().slice(0, 10);

    // Calculamos numero_cuota = max(existentes) + 1
    const existentes = paymentsByLead.get(a.lead.id) || [];
    const maxNum = existentes.reduce((m, p) => Math.max(m, p.numero_cuota || 0), 0);
    const numero = maxNum + 1;

    const { error } = await sb.from("payments").insert({
      lead_id: a.lead.id,
      numero_cuota: numero,
      monto_usd: a.monto,
      monto_ars: 0,
      estado: "pendiente",
      fecha_pago: null,
      fecha_vencimiento: vencimiento,
      es_renovacion: false,
      verificado: false,
    });
    if (error) {
      errores++;
      console.log(`ERR cuota ${a.lead.nombre}: ${error.message}`);
    } else {
      okCuotas++;
    }
  }
}
console.log(`✅ c1 insertadas: ${okC1}`);
console.log(`✅ cuotas pendientes insertadas: ${okCuotas}`);
console.log(`❌ errores: ${errores}`);
