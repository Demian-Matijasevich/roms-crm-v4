import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/CRM VENTAS SECURE SCALE (1).xlsx");
const wb = XLSX.read(buf);

const term = "distrito";

for (const sheet of wb.SheetNames) {
  const ws = wb.Sheets[sheet];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const NOMBRE_COL = cols.includes("Nombre") ? "Nombre" : (cols.includes("__EMPTY") ? "__EMPTY" : null);
  if (!NOMBRE_COL) continue;

  for (const r of rows) {
    const nombre = String(r[NOMBRE_COL] || "");
    if (nombre.toLowerCase().includes(term) || nombre.toLowerCase().includes("dlstrito")) {
      console.log(`[${sheet}]`);
      console.log(JSON.stringify(r, null, 2));
      console.log("---");
    }
  }
}
