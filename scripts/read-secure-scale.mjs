import { readFileSync } from "fs";
import * as XLSX from "xlsx";

const buf = readFileSync("C:/Users/matyc/Downloads/Nueva carpeta/CRM VENTAS SECURE SCALE.xlsx");
const wb = XLSX.read(buf);
console.log("Sheets:", wb.SheetNames);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log(`\n========== ${name} (${data.length} rows) ==========`);
  if (data.length > 0) {
    console.log("HEADERS:", JSON.stringify(data[0]));
    if (data.length > 1) {
      console.log("Sample row 1:");
      const header = data[0];
      const row = data[1];
      for (let i = 0; i < header.length; i++) {
        if (row[i] !== "" && row[i] !== undefined) {
          console.log(`  ${header[i]}: ${String(row[i]).slice(0, 100)}`);
        }
      }
    }
  }
}
