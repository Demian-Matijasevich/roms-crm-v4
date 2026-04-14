import * as XLSX from "xlsx";

const file = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const wb = XLSX.readFile(file);

for (const month of ["Marzo", "Abril"]) {
  const ws = wb.Sheets[month];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }) as any[];
  console.log(`\n═══ ${month} — ${rows.length} rows ═══`);
  console.log("Keys:", Object.keys(rows[0] || {}));
  let withC2 = 0;
  for (const r of rows) {
    const m2 = r["MONTO 2ª CUOTA"] || r["MONTO 2da CUOTA"] || r["MONTO SEGUNDA CUOTA"];
    if (m2 && m2.toString().trim() && m2 !== "0") {
      withC2++;
      if (withC2 <= 10) console.log(`  ${r["NOMBRE DEL ALUMNO"]} | c2 $${m2} | fecha: ${r["FECHA DE PAGO 2ª CUOTA"]}`);
    }
  }
  console.log(`  Total with c2: ${withC2}`);
}
