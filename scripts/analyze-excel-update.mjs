import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE.xlsx");
const wb = XLSX.read(buf);
console.log("Sheets:", wb.SheetNames);
console.log("");

// CRM Agendas tiene los estados
const ws = wb.Sheets["CRM Agendas"];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(`CRM Agendas: ${rows.length} filas`);

// Headers
if (rows.length > 0) {
  console.log("Headers:", Object.keys(rows[0]));
}

// Conteo de estados ("Situación")
const situaciones = new Map();
const sePresenta = new Map();
for (const r of rows) {
  const s = String(r["Situación"] || "").trim();
  const sp = String(r["¿Se presentó?"] || "").trim();
  if (s) situaciones.set(s, (situaciones.get(s) || 0) + 1);
  if (sp) sePresenta.set(sp, (sePresenta.get(sp) || 0) + 1);
}
console.log("\nSituaciones unicas:");
console.log([...situaciones.entries()].sort((a, b) => b[1] - a[1]));
console.log("\nSe presento:");
console.log([...sePresenta.entries()].sort((a, b) => b[1] - a[1]));

// Filtrar leads con info útil (nombre + situación)
const conNombre = rows.filter((r) => String(r["Nombre"] || "").trim().length > 1);
console.log(`\nFilas con nombre: ${conNombre.length}`);
console.log(`Con situación: ${conNombre.filter((r) => String(r["Situación"] || "").trim()).length}`);
console.log(`Con se_presentó: ${conNombre.filter((r) => String(r["¿Se presentó?"] || "").trim()).length}`);

// Muestra los últimos 5 con nombre
console.log("\nÚltimas 5 entradas con nombre:");
const lastFew = conNombre.slice(-5);
for (const r of lastFew) {
  console.log(`  ${r["Nombre"]} | se_presento=${r["¿Se presentó?"]} | sit=${r["Situación"]} | closer=${r["Closer"]} | prog=${r["Programa"]}`);
}
