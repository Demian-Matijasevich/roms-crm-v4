/**
 * Diff pagos de cada hoja de closer (VALEN, AGUS, JUAN BLANCO, Tomas Yafe)
 * contra la DB. Trae los pagos del Excel que falten en DB.
 *
 * Filosofía: solo agrega lo que falta. Si DB ya tiene c#1 pagada y Excel dice lo mismo,
 *            skip. Si Excel dice cash D1 pero DB no tiene c#1 pagada, REPORTA para aplicar.
 *
 * Usage:
 *   node scripts/diff-pagos-por-closer.mjs           → dry run
 *   node scripts/diff-pagos-por-closer.mjs --apply   → aplica los faltantes
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE (1).xlsx");
const wb = XLSX.read(buf);

const HOJAS_CLOSER = [
  { sheet: "VALEN CLOSING", closer: "Valen" },
  { sheet: "AGUS OLIVERO", closer: "Agustin" },
  { sheet: "JUAN BLANCO", closer: "Juan Blanco" },
  { sheet: "Tomas Yafe", closer: "Tomas Yafe" },
];

const COL_NOMBRE = ["Nombre", "Numero"];

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function parseMoney(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/[$,.\s]/g, "").replace(/[^\d-]/g, "");
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function excelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    // intentar parsear "Lunes 6/4", "6/4", "06/04", etc.
    const m = v.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (m) {
      const d = m[1].padStart(2, "0");
      const mo = m[2].padStart(2, "0");
      const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : "2026";
      return `${y}-${mo}-${d}`;
    }
    return null;
  }
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

console.log("Cargando DB...");
const { data: dbLeads } = await sb.from("leads").select("id, nombre, estado, closer_id, ticket_total").range(0, 9999);
const { data: dbPaymentsRaw } = await sb.from("payments").select("id, lead_id, monto_usd, estado, numero_cuota, fecha_pago, fecha_vencimiento, es_renovacion").range(0, 19999);
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

function findLead(nombre) {
  const key = normName(nombre);
  if (!key) return [];
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
  return matches;
}

const accionables = []; // {tipo, lead, closer_sheet, monto, fecha, motivo, raw}
const skipped = []; // {motivo, nombre, closer_sheet}
const stats = {};

for (const { sheet, closer } of HOJAS_CLOSER) {
  const ws = wb.Sheets[sheet];
  if (!ws) continue;
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  // Detectar la columna del nombre: prefiero "Nombre", sino "__EMPTY" (header vacio)
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const NOMBRE_COL = cols.includes("Nombre") ? "Nombre" : (cols.includes("__EMPTY") ? "__EMPTY" : "Nombre");
  const s = { perfect: 0, falta_c1: 0, falta_cuotas: 0, diff: 0, no_match: 0, ambiguo: 0, sin_data: 0, total_rows: rows.length };

  for (const r of rows) {
    const nombreRaw = r[NOMBRE_COL] || "";
    const nombre = String(nombreRaw).trim();
    if (!nombre || /^\d+$/.test(nombre)) continue; // skip filas con solo numero

    const cashD1 = parseMoney(r["Cash Collected Día 1"]);
    const cashTrato = parseMoney(r["Cash Collected Trato Cerrado"]);
    const montoRestante = parseMoney(r["Monto restante a pagar"] || r["Monto Restante a Pagar"]);
    const fechaPago = excelDate(r["Fecha de Pago para Ingreso"]) || excelDate(r["Fecha de Llamada"]);

    if (cashD1 === 0 && montoRestante === 0 && cashTrato === 0) {
      s.sin_data++;
      continue;
    }

    const matches = findLead(nombre);
    if (matches.length === 0) {
      s.no_match++;
      skipped.push({ motivo: "no_match", nombre, closer_sheet: sheet, cashD1, cashTrato, montoRestante, fechaPago });
      continue;
    }
    if (matches.length > 1) {
      s.ambiguo++;
      skipped.push({ motivo: "ambiguo", nombre, closer_sheet: sheet, count: matches.length });
      continue;
    }

    const lead = matches[0];
    const pays = paymentsByLead.get(lead.id) || [];
    const dbC1Pagada = pays.find((p) => p.numero_cuota === 1 && p.estado === "pagado" && !p.es_renovacion);
    const dbPendientes = pays.filter((p) => p.estado === "pendiente");
    const dbPendientesTotal = dbPendientes.reduce((sum, p) => sum + Number(p.monto_usd || 0), 0);

    let perfect = true;

    // Cash Día 1
    if (cashD1 > 0) {
      if (!dbC1Pagada) {
        s.falta_c1++;
        perfect = false;
        accionables.push({
          tipo: "FALTA_C1",
          lead,
          closer_sheet: sheet,
          monto: cashD1,
          fecha: fechaPago,
          motivo: `Excel(${sheet}) dice cash D1 $${cashD1.toLocaleString()} pero DB no tiene c#1 pagada`,
        });
      } else if (Math.abs(Number(dbC1Pagada.monto_usd) - cashD1) > 1) {
        s.diff++;
        perfect = false;
      }
    }

    // Monto Restante
    if (montoRestante > 0) {
      if (dbPendientes.length === 0) {
        s.falta_cuotas++;
        perfect = false;
        accionables.push({
          tipo: "FALTA_CUOTAS",
          lead,
          closer_sheet: sheet,
          monto: montoRestante,
          fecha: fechaPago,
          motivo: `Excel(${sheet}) dice monto restante $${montoRestante.toLocaleString()} pero DB no tiene pendientes`,
        });
      } else if (Math.abs(dbPendientesTotal - montoRestante) > 100) {
        s.diff++;
        perfect = false;
      }
    }

    if (perfect) s.perfect++;
  }

  stats[sheet] = s;
}

// REPORTE
const hr = () => console.log("─".repeat(70));
hr();
console.log("REPORTE POR CLOSER");
hr();
for (const [sheet, s] of Object.entries(stats)) {
  console.log(`\n📄 ${sheet}  (${s.total_rows} filas totales)`);
  console.log(`   ✅ PERFECT:        ${s.perfect}`);
  console.log(`   ➕ FALTA_C1:       ${s.falta_c1}`);
  console.log(`   ➕ FALTA_CUOTAS:   ${s.falta_cuotas}`);
  console.log(`   ⚠️  DIFF montos:    ${s.diff}`);
  console.log(`   ❌ NO_MATCH:       ${s.no_match}`);
  console.log(`   ❓ AMBIGUO:        ${s.ambiguo}`);
  console.log(`   ⊘ sin data pagos:  ${s.sin_data}`);
}

hr();
console.log("\nACCIONABLES — pagos que faltan en DB:");
hr();

// Deduplicar accionables por lead.id + tipo (si aparece en varias hojas)
const accionablesDedup = [];
const seen = new Set();
for (const a of accionables) {
  const key = `${a.lead.id}__${a.tipo}`;
  if (seen.has(key)) continue;
  seen.add(key);
  accionablesDedup.push(a);
}

const c1 = accionablesDedup.filter((a) => a.tipo === "FALTA_C1");
const cuotas = accionablesDedup.filter((a) => a.tipo === "FALTA_CUOTAS");

console.log(`\n# FALTA_C1 (${c1.length}) — insertar c#1 pagada:`);
for (const a of c1) {
  console.log(`  • [${a.closer_sheet}] ${a.lead.nombre} — $${a.monto.toLocaleString()} fecha=${a.fecha || "(hoy)"}`);
}

console.log(`\n# FALTA_CUOTAS (${cuotas.length}) — insertar 1 cuota pendiente:`);
for (const a of cuotas) {
  console.log(`  • [${a.closer_sheet}] ${a.lead.nombre} — $${a.monto.toLocaleString()}`);
}

if (skipped.filter((s) => s.motivo === "no_match").length > 0) {
  console.log(`\n❌ NO_MATCH (${skipped.filter((s) => s.motivo === "no_match").length}) — leads en Excel que no existen en DB:`);
  for (const sk of skipped.filter((s) => s.motivo === "no_match").slice(0, 30)) {
    const tags = [];
    if (sk.cashD1) tags.push(`D1=$${sk.cashD1}`);
    if (sk.cashTrato) tags.push(`Trato=$${sk.cashTrato}`);
    if (sk.montoRestante) tags.push(`Resto=$${sk.montoRestante}`);
    console.log(`  • [${sk.closer_sheet}] ${sk.nombre} — ${tags.join(" ")}`);
  }
}

if (!APPLY) {
  hr();
  console.log("\n📋 DRY RUN — pasá --apply para insertar los FALTA_*");
  process.exit(0);
}

// APPLY
hr();
console.log("APLICANDO...");
hr();
let ok = 0, err = 0;
for (const a of accionablesDedup) {
  if (a.tipo === "FALTA_C1") {
    const { error } = await sb.from("payments").insert({
      lead_id: a.lead.id,
      numero_cuota: 1,
      monto_usd: a.monto,
      monto_ars: 0,
      estado: "pagado",
      fecha_pago: a.fecha || new Date().toISOString().slice(0, 10),
      receptor: `Import Excel (${a.closer_sheet})`,
      es_renovacion: false,
      verificado: false,
    });
    if (error) { err++; console.log(`ERR ${a.lead.nombre}: ${error.message}`); }
    else { ok++; console.log(`✓ c#1 ${a.lead.nombre} $${a.monto}`); }
  } else if (a.tipo === "FALTA_CUOTAS") {
    const base = a.fecha || new Date().toISOString().slice(0, 10);
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + 30);
    const venc = d.toISOString().slice(0, 10);

    const exist = paymentsByLead.get(a.lead.id) || [];
    const maxNum = exist.reduce((m, p) => Math.max(m, p.numero_cuota || 0), 0);
    const num = maxNum + 1;

    const { error } = await sb.from("payments").insert({
      lead_id: a.lead.id,
      numero_cuota: num,
      monto_usd: a.monto,
      monto_ars: 0,
      estado: "pendiente",
      fecha_pago: null,
      fecha_vencimiento: venc,
      receptor: `Import Excel (${a.closer_sheet})`,
      es_renovacion: false,
      verificado: false,
    });
    if (error) { err++; console.log(`ERR cuota ${a.lead.nombre}: ${error.message}`); }
    else { ok++; console.log(`✓ cuota ${a.lead.nombre} $${a.monto} venc=${venc}`); }
  }
}
console.log(`\n✅ aplicados: ${ok}   ❌ errores: ${err}`);
