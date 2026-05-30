import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/Nueva carpeta/CRM VENTAS SECURE SCALE.xlsx");
const wb = XLSX.read(buf);

const hr = () => console.log("─".repeat(70));

// === CRM Agendas: extraer valores únicos de campos clave ===
const crmWs = wb.Sheets["CRM Agendas"];
const rows = XLSX.utils.sheet_to_json(crmWs, { defval: "" });
console.log(`CRM Agendas: ${rows.length} filas`);

function valoresUnicos(col, max = 30) {
  const counts = new Map();
  for (const r of rows) {
    const v = String(r[col] || "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

hr();
console.log('Valores únicos de "¿Se presentó?":');
console.log(valoresUnicos("¿Se presentó?"));

hr();
console.log('Valores únicos de "Situación":');
console.log(valoresUnicos("Situación"));

hr();
console.log('Valores únicos de "Calificado":');
console.log(valoresUnicos("Calificado"));

hr();
console.log('Valores únicos de "Fuente":');
console.log(valoresUnicos("Fuente"));

hr();
console.log('Valores únicos de "Estrategia":');
console.log(valoresUnicos("Estrategia"));

hr();
console.log('Valores únicos de "Medio de Agenda":');
console.log(valoresUnicos("Medio de Agenda"));

hr();
console.log('Valores únicos de "Closer":');
console.log(valoresUnicos("Closer"));

hr();
console.log('Valores únicos de "Setter ":');
console.log(valoresUnicos("Setter "));

hr();
console.log('Valores únicos de "Programa":');
console.log(valoresUnicos("Programa", 20));

hr();
console.log("Sample de 3 llamadas cerradas con detalle completo:");
const cerradas = rows.filter((r) => String(r["Situación"]).toLowerCase().includes("cerr")).slice(0, 3);
for (const r of cerradas) {
  console.log("\n", JSON.stringify(r, null, 2).slice(0, 1200));
}

hr();
console.log("Sample de 3 llamadas no-show o canceladas:");
const noshow = rows.filter((r) => /no show|cancel|no se present/i.test(String(r["¿Se presentó?"]) + r["Situación"])).slice(0, 3);
for (const r of noshow) {
  console.log("\n", JSON.stringify(r, null, 2).slice(0, 800));
}

// === Métricas: ver qué KPIs calculan ===
hr();
console.log("\n=== HOJA MÉTRICAS (KPIs mensuales) ===");
const metricsWs = wb.Sheets["Métricas"];
const metricsData = XLSX.utils.sheet_to_json(metricsWs, { header: 1, defval: "" });
for (let i = 0; i < Math.min(metricsData.length, 46); i++) {
  const row = metricsData[i];
  const label = String(row[0] || "").trim();
  if (label) console.log(`${String(i + 1).padStart(2, " ")}. ${label}`);
}

// === SETTING ===
hr();
console.log("\n=== HOJA SETTING — métricas de setters ===");
const setWs = wb.Sheets["SETTING"];
const setData = XLSX.utils.sheet_to_json(setWs, { header: 1, defval: "" });
console.log("Headers fila 0:", setData[0]?.slice(0, 50));
console.log("Headers fila 1 (labels):", setData[1]?.slice(0, 50));
// Buscar una fila de datos real
for (let i = 2; i < Math.min(setData.length, 8); i++) {
  const filled = setData[i].filter((x) => x !== "" && x !== undefined).length;
  if (filled > 5) {
    console.log(`Fila ${i} con ${filled} celdas:`, setData[i].slice(0, 50));
    break;
  }
}

// === Pagos ===
hr();
console.log("\n=== HOJA Pagos ===");
const pagosWs = wb.Sheets["Pagos"];
const pagosData = XLSX.utils.sheet_to_json(pagosWs, { header: 1, defval: "" });
console.log(`${pagosData.length} filas`);
console.log("Headers:", pagosData[0]);
if (pagosData.length > 1) {
  console.log("Sample row:", pagosData[1]);
}
