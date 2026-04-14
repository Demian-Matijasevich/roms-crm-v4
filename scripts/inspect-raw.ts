import * as XLSX from "xlsx";

const file = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const wb = XLSX.readFile(file);

const ws = wb.Sheets["Abril"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as any[][];
console.log(`Abril: ${rows.length} rows`);
console.log("Row 0 (header):", rows[0]);
console.log("Row 1 (header row2?):", rows[1]);
for (let i = 2; i < Math.min(8, rows.length); i++) {
  console.log(`Row ${i}:`, rows[i]);
}
