import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const FINANZAS = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0];
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { const [_, dd, mm, yy] = m; const y = yy.length === 2 ? "20" + yy : yy; return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; }
  }
  return null;
}
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function toNum(v: any) { return parseFloat(String(v || "0").replace(/[$,]/g, "")) || 0; }

async function main() {
  // 1. Parse xlsx
  const wb = XLSX.readFile(FINANZAS);
  type XP = { nombre: string; monto: number; fecha: string | null };
  const xlsxPays: XP[] = [];
  for (const month of ["Enero", "Febrero", "Marzo", "Abril"]) {
    const ws = wb.Sheets[month];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: "" }) as any[];
    for (const r of rows) {
      const nombre = String(r["NOMBRE DEL ALUMNO"] || "").trim();
      const monto = toNum(r["PAGO USD"]);
      if (!nombre || monto <= 0) continue;
      xlsxPays.push({ nombre, monto, fecha: parseDate(r["FECHA DE CARGA"]) });
    }
  }

  // 2. Fetch Sheet Registro Calls relevant columns
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheetsApi = google.sheets({ version: "v4", auth });
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A2:Y1100",
  });
  type SheetRow = {
    row: number; nombre: string; cashDia1: number; cashTotal: number; ticketTotal: number;
    pago1: number; pago2: number; pago3: number;
  };
  const sheetRows: SheetRow[] = [];
  (res.data.values || []).forEach((r, idx) => {
    const nombre = String(r[0] || "").trim();
    if (!nombre) return;
    sheetRows.push({
      row: idx + 2,
      nombre,
      cashDia1: toNum(r[12]),
      cashTotal: toNum(r[13]),
      ticketTotal: toNum(r[14]),
      pago1: toNum(r[16]),
      pago2: toNum(r[19]),
      pago3: toNum(r[21]),
    });
  });
  console.log(`Sheet: ${sheetRows.length} filas parsed`);

  // 3. Fetch all DB payments with leads
  const { data: allPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado")
    .eq("estado", "pagado")
    .range(0, 4999);
  const { data: allLeads } = await sb.from("leads").select("id, nombre, sheets_row_index, estado").range(0, 4999);
  const leadMap = Object.fromEntries((allLeads || []).map((l) => [l.id, l]));

  // 4. For each DB payment, check if it exists in either xlsx OR Sheet
  const legitSheet: any[] = [];
  const legitBoth: any[] = [];
  const suspect: any[] = [];
  const legitXlsx: any[] = [];

  for (const p of allPays || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    if (!lead) continue;
    const needleWords = norm(lead.nombre).split(" ").filter((w) => w.length > 2);

    // Match against xlsx
    const xlsxMatch = xlsxPays.find((x) => {
      const xn = norm(x.nombre);
      return needleWords.every((w) => xn.includes(w)) && Math.abs(x.monto - p.monto_usd) < 0.5;
    });

    // Match against Sheet: does ANY sheet row with matching name have this monto in cashDia1/pago1/pago2/pago3?
    const sheetMatch = sheetRows.find((s) => {
      const sn = norm(s.nombre);
      if (!needleWords.every((w) => sn.includes(w))) return false;
      return [s.cashDia1, s.pago1, s.pago2, s.pago3, s.cashTotal].some((v) => Math.abs(v - p.monto_usd) < 0.5);
    });

    const info = { id: p.id, nombre: lead.nombre, monto: p.monto_usd, cuota: p.numero_cuota, fecha: p.fecha_pago?.split("T")[0] || "—" };

    if (xlsxMatch && sheetMatch) legitBoth.push(info);
    else if (xlsxMatch) legitXlsx.push(info);
    else if (sheetMatch) legitSheet.push(info);
    else suspect.push(info);
  }

  console.log(`\n✅ Legítimos en AMBOS (xlsx + sheet): ${legitBoth.length}`);
  console.log(`📄 Legítimos solo en xlsx: ${legitXlsx.length}`);
  console.log(`📊 Legítimos solo en Sheet: ${legitSheet.length}`);
  console.log(`❌ SOSPECHOSOS (en ni uno ni otro): ${suspect.length}`);
  for (const s of suspect) console.log(`   ${s.nombre.padEnd(32)} | c${s.cuota} $${String(s.monto).padStart(6)} | ${s.fecha} | id:${s.id.substring(0,8)}`);

  const suspectTotal = suspect.reduce((s, p) => s + p.monto, 0);
  console.log(`\nSospechosos total: $${suspectTotal}`);
}

main().catch(console.error);
