import * as XLSX from "xlsx";

const file = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const wb = XLSX.readFile(file);

console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];
  console.log(`\n═══ ${name} (${rows.length} rows) ═══`);
  console.log("Headers:", rows[0]);
  console.log("First 3 data rows:");
  for (let i = 1; i < Math.min(4, rows.length); i++) console.log(" ", rows[i]);
}
