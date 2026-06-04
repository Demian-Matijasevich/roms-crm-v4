/**
 * Dump COMPLETO de todos los pagos que aparecen en cada hoja de closer.
 * Muestra: hoja, nombre, cashD1, cashTrato, montoRestante, fechaPago (raw + parseada), closer.
 * No toca la DB. Solo lista para revisar manualmente.
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE (1).xlsx");
const wb = XLSX.read(buf);

const HOJAS = ["CRM Agendas", "VALEN CLOSING", "AGUS OLIVERO", "JUAN BLANCO", "Tomas Yafe"];

function parseMoney(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/[$,.\s]/g, "").replace(/[^\d-]/g, "");
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function fechaParse(v) {
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

for (const sheet of HOJAS) {
  const ws = wb.Sheets[sheet];
  if (!ws) continue;
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const NOMBRE_COL = cols.includes("Nombre") ? "Nombre" : (cols.includes("__EMPTY") ? "__EMPTY" : "Nombre");

  console.log(`\n\n══════════════════════════════════════════════════════════`);
  console.log(`📄 ${sheet}`);
  console.log(`══════════════════════════════════════════════════════════`);

  const withPagos = rows
    .map((r) => ({
      nombre: String(r[NOMBRE_COL] || "").trim(),
      cashD1: parseMoney(r["Cash Collected Día 1"]),
      cashTrato: parseMoney(r["Cash Collected Trato Cerrado"]),
      restante: parseMoney(r["Monto restante a pagar"] || r["Monto Restante a Pagar"]),
      fechaPagoRaw: r["Fecha de Pago para Ingreso"],
      fechaLlamadaRaw: r["Fecha de Llamada"],
      situacion: r["Situación"],
      closer: r["Closer"],
      programa: r["Programa"],
    }))
    .filter((r) => r.nombre && (r.cashD1 > 0 || r.cashTrato > 0 || r.restante > 0));

  console.log(`Total con pagos: ${withPagos.length}\n`);

  for (const r of withPagos) {
    const fp = fechaParse(r.fechaPagoRaw) || r.fechaPagoRaw;
    const fl = fechaParse(r.fechaLlamadaRaw) || r.fechaLlamadaRaw;
    const cash = [];
    if (r.cashD1) cash.push(`D1=$${r.cashD1.toLocaleString()}`);
    if (r.cashTrato) cash.push(`Trato=$${r.cashTrato.toLocaleString()}`);
    if (r.restante) cash.push(`Resto=$${r.restante.toLocaleString()}`);
    console.log(`  ${r.nombre.padEnd(35)} | ${cash.join(" ").padEnd(35)} | FechaPago=${String(fp || "—").padEnd(12)} | FechaLlam=${fl || "—"} | ${r.situacion || ""}`);
  }
}
