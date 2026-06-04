/**
 * Lee TODAS las hojas del Excel y muestra estructura + sample de cada una.
 */
import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE (1).xlsx");
const wb = XLSX.read(buf);

console.log(`📊 ${wb.SheetNames.length} hojas en el Excel:\n`);
wb.SheetNames.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log("\n" + "═".repeat(70));
  console.log(`📄 ${name}  —  ${data.length} filas`);
  console.log("═".repeat(70));

  if (data.length === 0) {
    console.log("(vacía)");
    continue;
  }

  // Headers (primera fila no vacía con texto)
  const headers = data[0] || [];
  const nonEmptyHeaders = headers.filter((h) => String(h || "").trim());
  console.log(`Headers (${nonEmptyHeaders.length} columnas con nombre):`);
  console.log(`  ${nonEmptyHeaders.map((h) => `[${h}]`).join(" ")}`);

  // Contar filas con data real (al menos un valor no vacío más allá de la primera col)
  const dataRows = data.slice(1).filter((row) => row.some((c) => c !== "" && c !== null && c !== undefined));
  console.log(`Filas con datos: ${dataRows.length}`);

  // Sample primeras 3 filas con datos
  if (dataRows.length > 0) {
    console.log("Primeras filas (sample):");
    for (let i = 0; i < Math.min(3, dataRows.length); i++) {
      const row = dataRows[i];
      const summary = headers.map((h, idx) => {
        if (!h) return null;
        const v = row[idx];
        if (v === "" || v === null || v === undefined) return null;
        return `${h}=${String(v).slice(0, 40)}`;
      }).filter(Boolean).slice(0, 5);
      console.log(`  ${i + 1}. ${summary.join(" | ")}`);
    }
  }
}

console.log("\n" + "═".repeat(70));
console.log("✅ Análisis completo");
