import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const file = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const [_, dd, mm, yy] = m;
      const yyyy = yy.length === 2 ? "20" + yy : yy;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);
  }
  return null;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function main() {
  // Parse all months
  const wb = XLSX.readFile(file);
  const MONTHS = ["Enero", "Febrero", "Marzo", "Abril"];
  type XlsxPay = { nombre: string; monto: number; fecha: string | null; concepto: string; recibe: string; mes: string };
  const xlsxPays: XlsxPay[] = [];
  for (const month of MONTHS) {
    const ws = wb.Sheets[month];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" }) as any[];
    for (const r of rows) {
      const nombre = (r["NOMBRE DEL ALUMNO"] || "").toString().trim();
      if (!nombre) continue;
      const monto = parseFloat((r["PAGO USD"] || "0").toString().replace(/[$,]/g, "")) || 0;
      if (monto <= 0) continue;
      xlsxPays.push({
        nombre, monto,
        fecha: parseDate(r["FECHA DE CARGA"]),
        concepto: (r["Concepto"] || "").toString(),
        recibe: (r["recibe"] || "").toString(),
        mes: month,
      });
    }
  }
  console.log(`Parsed ${xlsxPays.length} payments from xlsx`);

  // Fetch DB payments without fecha
  const { data: dbPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, numero_cuota")
    .eq("estado", "pagado")
    .is("fecha_pago", null)
    .range(0, 4999);
  const leadIds = [...new Set((dbPays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id, nombre").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l.nombre]));

  console.log(`\nDB payments without fecha: ${dbPays?.length}\n`);
  console.log("MATCH REPORT:");
  console.log("═".repeat(100));

  const matches: { pay_id: string; fecha: string; nombre: string; monto: number }[] = [];
  for (const p of dbPays || []) {
    const leadName = p.lead_id ? leadMap[p.lead_id] : null;
    if (!leadName) continue;
    const needle = norm(leadName).split(" ").filter((w) => w.length > 2);
    const candidates = xlsxPays.filter((x) => {
      const xName = norm(x.nombre);
      return needle.some((w) => xName.includes(w));
    });
    // Filter by monto (exact or close)
    const monto = p.monto_usd;
    const exact = candidates.filter((c) => Math.abs(c.monto - monto) < 0.5);

    const status = exact.length === 1 && exact[0].fecha ? "✓" : exact.length === 0 ? "❌" : "?";
    console.log(`\n${status} ${leadName} | c${p.numero_cuota} $${monto}`);
    if (candidates.length === 0) {
      console.log(`    NO candidates found in xlsx by name`);
    } else {
      for (const c of exact.slice(0, 5)) {
        console.log(`    → ${c.mes} | $${c.monto} | ${c.fecha || "SIN FECHA"} | ${c.concepto} | ${c.nombre}`);
      }
      if (exact.length === 0) {
        // show non-exact for reference
        for (const c of candidates.slice(0, 3)) {
          console.log(`    ~ ${c.mes} | $${c.monto} (diff!) | ${c.fecha || "—"} | ${c.concepto} | ${c.nombre}`);
        }
      }
      if (exact.length === 1 && exact[0].fecha) {
        matches.push({ pay_id: p.id, fecha: exact[0].fecha, nombre: leadName, monto });
      }
    }
  }

  console.log(`\n\n═══ RESUMEN ═══`);
  console.log(`Matches automáticos (1 resultado exacto + fecha): ${matches.length} de ${dbPays?.length}`);
  console.log(`\n--apply  para ejecutar los ${matches.length} updates`);

  if (process.argv.includes("--apply")) {
    console.log("\nAplicando updates...");
    for (const m of matches) {
      const { error } = await sb.from("payments").update({ fecha_pago: m.fecha }).eq("id", m.pay_id);
      if (error) console.log(`  ❌ ${m.nombre}: ${error.message}`);
      else console.log(`  ✓ ${m.nombre} $${m.monto} → ${m.fecha}`);
    }
  }
}

main().catch(console.error);
