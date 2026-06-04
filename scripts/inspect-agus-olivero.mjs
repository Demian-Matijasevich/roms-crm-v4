/**
 * Inspecciona AGUS OLIVERO con detalle:
 * - Lista todas las columnas (con repetidas si las hay)
 * - Saca filas que tengan algun monto numerico
 * - Filtra por fechas recientes (junio)
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE (1).xlsx");
const wb = XLSX.read(buf);
const ws = wb.Sheets["AGUS OLIVERO"];

// header raw row
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
console.log("Headers row (raw):");
console.log(raw[0]);
console.log("Total filas:", raw.length);

// Buscar filas con CUALQUIER monto
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(`\nUsing first-row headers, ${rows.length} data rows.\n`);

console.log("Columnas detectadas:");
if (rows.length > 0) {
  console.log(Object.keys(rows[0]));
}

console.log("\nFilas con CUALQUIER monto detectable (>0):");
let count = 0;
for (const r of rows) {
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number" && v > 50 && v < 1000000 && !k.toLowerCase().includes("fecha") && !k.toLowerCase().includes("agenda") && !k.toLowerCase().includes("llamada")) {
      // Probablemente un monto
      console.log(`  Fila: Nombre="${r.Nombre || r["Nombre"] || "(no name)"}" | ${k}=${v} | Fecha=${r["Fecha de Llamada"] || r["Fecha de Pago para Ingreso"] || "(no fecha)"}`);
      count++;
      if (count > 50) break;
      break;
    }
  }
  if (count > 50) break;
}
console.log(`Total filas con montos: ~${count}`);

console.log("\n──── FILAS RECIENTES (junio) ────");
for (const r of rows) {
  const fecha = r["Fecha de Llamada"] || r["Fecha de Pago para Ingreso"];
  if (typeof fecha === "number" && fecha >= 46172 && fecha <= 46180) { // junio 2026
    console.log(`  ${JSON.stringify(r)}`);
  }
  if (typeof fecha === "string" && /jun|6\/|junio/i.test(fecha)) {
    console.log(`  STR: ${JSON.stringify(r)}`);
  }
}

console.log("\n──── ÚLTIMAS 10 FILAS CON DATOS ────");
const withData = rows.filter((r) => Object.values(r).some((v) => v !== "" && v !== null));
for (const r of withData.slice(-10)) {
  console.log(JSON.stringify(r));
}
