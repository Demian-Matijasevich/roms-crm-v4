import * as XLSX from "xlsx";
const wb = XLSX.readFile("C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx");

for (const month of ["Febrero", "Marzo", "Abril"]) {
  const ws = wb.Sheets[month];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: "" }) as any[];
  console.log(`\n═══ ${month} ═══ (${rows.length} rows)`);
  for (const r of rows) {
    const nombre = (r["NOMBRE DEL ALUMNO"] || "").toString();
    if (!nombre) continue;
    const fecha = r["FECHA DE CARGA"];
    console.log(`  ${nombre.padEnd(40)} | fecha=${JSON.stringify(fecha)} (${typeof fecha}) | monto=${r["PAGO USD"]}`);
  }
}
