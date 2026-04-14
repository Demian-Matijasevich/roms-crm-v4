import * as XLSX from "xlsx";

const file = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const wb = XLSX.readFile(file);

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril"];

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  if (typeof v === "string") {
    // Try dd/mm/yyyy
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const [_, dd, mm, yy] = m;
      const yyyy = yy.length === 2 ? "20" + yy : yy;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    // Try yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);
  }
  return null;
}

const allPayments: {
  nombre: string;
  monto: number;
  fecha: string | null;
  cuota: number;
  metodo: string;
  recibe: string;
  mes: string;
}[] = [];

for (const month of MONTHS) {
  const ws = wb.Sheets[month];
  if (!ws) continue;
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }) as any[];
  for (const r of rows) {
    const nombre = (r["NOMBRE DEL ALUMNO"] || "").toString().trim();
    if (!nombre) continue;
    const fecha1 = parseDate(r["FECHA DE CARGA"]);
    const monto1 = parseFloat((r["PAGO USD"] || "0").toString().replace(/[$,]/g, "")) || 0;
    if (monto1 > 0) {
      allPayments.push({
        nombre, monto: monto1, fecha: fecha1, cuota: 1,
        metodo: (r["Metodo de pago "] || r["MÉTODO DE PAGO"] || "").toString(),
        recibe: (r["recibe"] || "").toString(),
        mes: month,
      });
    }
    const fecha2 = parseDate(r["FECHA DE PAGO 2ª CUOTA"]);
    const monto2 = parseFloat((r["MONTO 2ª CUOTA"] || "0").toString().replace(/[$,]/g, "")) || 0;
    if (monto2 > 0) {
      allPayments.push({
        nombre, monto: monto2, fecha: fecha2, cuota: 2,
        metodo: (r["MÉTODO DE PAGO"] || "").toString(),
        recibe: (r["recibe"] || "").toString(),
        mes: month,
      });
    }
  }
}

console.log(`Total payments parsed: ${allPayments.length}`);

// Group by normalized name
function norm(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

const TARGETS = [
  "Sinziana Lacob", "Luciano Molero", "Matias Randazzo", "Miguel Angel",
  "Nazareno", "Valentina", "FEDERICO LEZCANO", "Mariano Leonel Mamani Molina",
  "Emilia Lopez", "Gabriela Kelly Castro", "Rodrigo Machado", "Tomas Fernandez",
  "Jorge", "Facundo", "Bautista Pandolfi", "Pedro Agüero", "IRENO",
  "Rodrigo Bailone", "Saba", "Juan", "Javi Cuman",
];

for (const target of TARGETS) {
  const needle = norm(target);
  const matches = allPayments.filter((p) => norm(p.nombre).includes(needle) || needle.includes(norm(p.nombre).split(" ")[0]));
  console.log(`\n── ${target} ──`);
  if (matches.length === 0) {
    console.log("   (no encontrado en FINANZAS)");
    continue;
  }
  for (const m of matches) {
    console.log(`   ${m.mes} | c${m.cuota} | $${String(m.monto).padStart(7)} | ${m.fecha || "sin fecha"} | recibe:${m.recibe} | ${m.nombre}`);
  }
}
