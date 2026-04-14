import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const FINANZAS = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

function parseExcelDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0];
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { const [_, dd, mm, yy] = m; const y = yy.length === 2 ? "20" + yy : yy; return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; }
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);
  }
  return null;
}

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

type XlsxPay = { nombre: string; monto: number; fecha: string | null; concepto: string; mes: string; recibe: string };

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("   🔍 AUDITORÍA MAESTRA ROMS v4");
  console.log("═══════════════════════════════════════════════\n");

  // ══════════════════════════════════════════
  // STEP 1: Parse FINANZAS xlsx
  // ══════════════════════════════════════════
  const wb = XLSX.readFile(FINANZAS);
  const xlsxPays: XlsxPay[] = [];
  for (const month of ["Enero", "Febrero", "Marzo", "Abril"]) {
    const ws = wb.Sheets[month];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: "" }) as any[];
    for (const r of rows) {
      const nombre = (r["NOMBRE DEL ALUMNO"] || "").toString().trim();
      if (!nombre) continue;
      const monto = parseFloat(String(r["PAGO USD"] || "0").replace(/[$,]/g, "")) || 0;
      if (monto <= 0) continue;
      xlsxPays.push({
        nombre, monto,
        fecha: parseExcelDate(r["FECHA DE CARGA"]),
        concepto: String(r["Concepto"] || ""),
        mes: month,
        recibe: String(r["recibe"] || ""),
      });
    }
  }
  console.log(`📊 FINANZAS xlsx: ${xlsxPays.length} pagos`);
  const xlsxByMonth: Record<string, number> = {};
  for (const p of xlsxPays) {
    const month = p.fecha?.substring(0, 7) || p.mes;
    xlsxByMonth[month] = (xlsxByMonth[month] || 0) + p.monto;
  }
  for (const [k, v] of Object.entries(xlsxByMonth).sort()) console.log(`   ${k}: $${v}`);

  // ══════════════════════════════════════════
  // STEP 2: Fetch Supabase payments + leads
  // ══════════════════════════════════════════
  const { data: allPays } = await sb
    .from("payments")
    .select("id, lead_id, client_id, monto_usd, fecha_pago, numero_cuota, estado, receptor")
    .eq("estado", "pagado")
    .range(0, 4999);
  const { data: allLeads } = await sb.from("leads").select("id, nombre, estado, fecha_llamada, ticket_total, sheets_row_index").range(0, 4999);
  const leadMap = Object.fromEntries((allLeads || []).map((l) => [l.id, l]));
  console.log(`\n💾 Supabase: ${allPays?.length} pagos pagados | ${allLeads?.length} leads`);

  // ══════════════════════════════════════════
  // STEP 3: Find DUPLICATES in Supabase
  // (same lead_id + same monto + same fecha = duplicate)
  // ══════════════════════════════════════════
  const dupGroups: Record<string, typeof allPays> = {};
  for (const p of allPays || []) {
    const key = `${p.lead_id || "null"}|${Math.round(p.monto_usd)}|${p.fecha_pago?.split("T")[0] || "nodate"}`;
    (dupGroups[key] ||= []).push(p);
  }
  const duplicates: { keep: string; drop: string[]; info: string }[] = [];
  for (const [key, group] of Object.entries(dupGroups)) {
    if (group.length > 1) {
      const [keep, ...drops] = group.sort((a, b) => (a.numero_cuota || 0) - (b.numero_cuota || 0));
      const lead = keep.lead_id ? leadMap[keep.lead_id] : null;
      const info = `${lead?.nombre || "NO-LEAD"} | $${keep.monto_usd} | ${keep.fecha_pago?.split("T")[0] || "sin fecha"}`;
      duplicates.push({ keep: keep.id, drop: drops.map((d) => d.id), info });
    }
  }
  console.log(`\n🔁 DUPLICADOS (mismo lead+monto+fecha): ${duplicates.length}`);
  for (const d of duplicates.slice(0, 50)) console.log(`   ${d.info} — borrar ${d.drop.length}`);

  // ══════════════════════════════════════════
  // STEP 4: Payments WITHOUT lead_id (huérfanos)
  // ══════════════════════════════════════════
  const orphans = (allPays || []).filter((p) => !p.lead_id && !p.client_id);
  console.log(`\n👻 HUÉRFANOS (sin lead_id ni client_id): ${orphans.length}`);
  for (const o of orphans) console.log(`   $${o.monto_usd} | ${o.fecha_pago?.split("T")[0] || "sin fecha"} | c${o.numero_cuota} | receptor:${o.receptor || "—"}`);

  // ══════════════════════════════════════════
  // STEP 5: Payments WITHOUT fecha_pago
  // ══════════════════════════════════════════
  const noFecha = (allPays || []).filter((p) => !p.fecha_pago);
  console.log(`\n📅 SIN FECHA: ${noFecha.length} (total $${noFecha.reduce((s, p) => s + p.monto_usd, 0)})`);

  // ══════════════════════════════════════════
  // STEP 6: Supabase payments NOT in xlsx (possibly corrupt)
  // ══════════════════════════════════════════
  const notInXlsx: { nombre: string; monto: number; cuota: number; fecha: string; id: string }[] = [];
  for (const p of allPays || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    if (!lead) continue;
    const needle = norm(lead.nombre).split(" ").filter((w) => w.length > 2);
    const match = xlsxPays.find((x) => {
      const xn = norm(x.nombre);
      return needle.some((w) => xn.includes(w)) && Math.abs(x.monto - p.monto_usd) < 0.5;
    });
    if (!match) {
      notInXlsx.push({ nombre: lead.nombre, monto: p.monto_usd, cuota: p.numero_cuota, fecha: p.fecha_pago?.split("T")[0] || "—", id: p.id });
    }
  }
  console.log(`\n❓ PAGOS EN DB PERO NO EN xlsx: ${notInXlsx.length} (total $${notInXlsx.reduce((s, p) => s + p.monto, 0)})`);
  for (const n of notInXlsx.slice(0, 40)) console.log(`   ${n.nombre.padEnd(32)} | c${n.cuota} $${String(n.monto).padStart(6)} | ${n.fecha}`);

  // ══════════════════════════════════════════
  // STEP 7: xlsx payments NOT in Supabase (missing import)
  // ══════════════════════════════════════════
  const notInDb: XlsxPay[] = [];
  for (const x of xlsxPays) {
    const needle = norm(x.nombre).split(" ").filter((w) => w.length > 2);
    const match = (allPays || []).find((p) => {
      const lead = p.lead_id ? leadMap[p.lead_id] : null;
      if (!lead) return false;
      const ln = norm(lead.nombre);
      return needle.some((w) => ln.includes(w)) && Math.abs(p.monto_usd - x.monto) < 0.5;
    });
    if (!match) notInDb.push(x);
  }
  console.log(`\n📥 PAGOS EN xlsx PERO NO EN DB: ${notInDb.length} (total $${notInDb.reduce((s, p) => s + p.monto, 0)})`);
  for (const n of notInDb.slice(0, 40)) console.log(`   ${n.mes} | ${n.fecha || "—"} | $${String(n.monto).padStart(6)} | ${n.nombre} | ${n.concepto}`);

  // ══════════════════════════════════════════
  // STEP 8: Duplicate leads (same name)
  // ══════════════════════════════════════════
  const nameGroups: Record<string, typeof allLeads> = {};
  for (const l of allLeads || []) {
    const key = norm(l.nombre);
    if (!key) continue;
    (nameGroups[key] ||= []).push(l);
  }
  const dupLeads = Object.entries(nameGroups).filter(([, g]) => g.length > 1);
  console.log(`\n👥 LEADS DUPLICADOS (mismo nombre): ${dupLeads.length}`);
  for (const [name, group] of dupLeads.slice(0, 30)) {
    console.log(`   ${name}:`);
    for (const l of group) console.log(`     id:${l.id.substring(0, 8)} | estado:${l.estado} | row:${l.sheets_row_index || "—"} | ticket:${l.ticket_total}`);
  }

  // ══════════════════════════════════════════
  // STEP 9: April cash recalc
  // ══════════════════════════════════════════
  const abrilPays = (allPays || []).filter((p) => {
    const f = p.fecha_pago?.split("T")[0] || "";
    return f >= "2026-04-01" && f <= "2026-04-30";
  });
  const abrilTotal = abrilPays.reduce((s, p) => s + p.monto_usd, 0);
  console.log(`\n💰 ABRIL 2026 en DB: ${abrilPays.length} pagos = $${abrilTotal}`);

  const abrilXlsx = xlsxPays.filter((p) => p.fecha?.startsWith("2026-04"));
  const abrilXlsxTotal = abrilXlsx.reduce((s, p) => s + p.monto, 0);
  console.log(`   vs xlsx: ${abrilXlsx.length} pagos = $${abrilXlsxTotal}`);
  console.log(`   diferencia: $${abrilTotal - abrilXlsxTotal}`);

  // ══════════════════════════════════════════
  // STEP 10: Google Sheets — sheets_row_index duplicates
  // ══════════════════════════════════════════
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'📞 Registro Calls'!A2:A1100",
    });
    const rows = res.data.values || [];
    const nameToRows: Record<string, number[]> = {};
    rows.forEach((r, idx) => {
      const name = norm(String(r[0] || ""));
      if (name && name.length > 2) (nameToRows[name] ||= []).push(idx + 2);
    });
    const sheetDups = Object.entries(nameToRows).filter(([, rs]) => rs.length > 1);
    console.log(`\n📊 DUPLICADOS EN SHEET Registro Calls: ${sheetDups.length}`);
    for (const [name, rs] of sheetDups.slice(0, 30)) console.log(`   ${name} → rows ${rs.join(", ")}`);
  } catch (e: any) {
    console.log("\n⚠️  No se pudo leer Sheet:", e.message);
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("   FIN AUDITORÍA");
  console.log("═══════════════════════════════════════════════");
}

main().catch(console.error);
