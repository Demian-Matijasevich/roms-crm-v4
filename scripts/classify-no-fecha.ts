import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const file = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0];
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { const [_, dd, mm, yy] = m; const y = yy.length === 2 ? "20" + yy : yy; return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; }
  }
  return null;
}
function norm(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

async function main() {
  const wb = XLSX.readFile(file);
  const MONTHS = ["Enero", "Febrero", "Marzo", "Abril"];
  type XlsxPay = { nombre: string; monto: number; fecha: string | null; concepto: string; recibe: string; mes: string };
  const xlsxPays: XlsxPay[] = [];
  for (const month of MONTHS) {
    const ws = wb.Sheets[month];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: "" }) as any[];
    for (const r of rows) {
      const nombre = (r["NOMBRE DEL ALUMNO"] || "").toString().trim();
      if (!nombre) continue;
      const monto = parseFloat((r["PAGO USD"] || "0").toString().replace(/[$,]/g, "")) || 0;
      if (monto <= 0) continue;
      xlsxPays.push({ nombre, monto, fecha: parseDate(r["FECHA DE CARGA"]), concepto: (r["Concepto"] || "").toString(), recibe: (r["recibe"] || "").toString(), mes: month });
    }
  }

  // All DB payments (with and without fecha) for leads we care about
  const { data: dbNoFecha } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, numero_cuota")
    .eq("estado", "pagado")
    .is("fecha_pago", null)
    .range(0, 4999);

  const leadIds = [...new Set((dbNoFecha || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id, nombre, fecha_llamada, ticket_total, estado").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  // Get ALL payments for those leads (to detect duplicates)
  const { data: allPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, numero_cuota, fecha_pago, estado")
    .in("lead_id", leadIds);

  const duplicates: { id: string; nombre: string; monto: number; cuota: number; reason: string }[] = [];
  const dateUpdates: { id: string; fecha: string; nombre: string; monto: number }[] = [];
  const needReview: { id: string; nombre: string; monto: number; cuota: number; xlsxFecha: string | null; reason: string }[] = [];
  const noXlsxRow: { id: string; nombre: string; monto: number; cuota: number; ticketTotal: number; estado: string; leadFechaLlamada: string | null }[] = [];

  for (const p of dbNoFecha || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    if (!lead) continue;
    const nombre = lead.nombre;
    const needle = norm(nombre).split(" ").filter((w) => w.length > 2);
    const candidates = xlsxPays.filter((x) => {
      const xName = norm(x.nombre);
      return needle.some((w) => xName.includes(w)) && Math.abs(x.monto - p.monto_usd) < 0.5;
    });

    // Check if DB has another payment for same lead+monto WITH fecha (would mean this is a dup)
    const sameLead = (allPays || []).filter((ap) => ap.lead_id === p.lead_id && ap.id !== p.id && Math.abs(ap.monto_usd - p.monto_usd) < 0.5);
    const sameWithFecha = sameLead.filter((ap) => ap.fecha_pago);

    if (candidates.length === 0) {
      noXlsxRow.push({ id: p.id, nombre, monto: p.monto_usd, cuota: p.numero_cuota, ticketTotal: lead.ticket_total || 0, estado: lead.estado, leadFechaLlamada: lead.fecha_llamada?.split("T")[0] || null });
    } else if (candidates.length === 1 && sameWithFecha.some((a) => a.fecha_pago?.split("T")[0] === candidates[0].fecha)) {
      // DB already has a payment with this monto + this fecha → duplicate
      duplicates.push({ id: p.id, nombre, monto: p.monto_usd, cuota: p.numero_cuota, reason: `Ya existe otro pago de $${p.monto_usd} con fecha ${candidates[0].fecha}` });
    } else if (candidates.length === 1 && candidates[0].fecha && sameWithFecha.length === 0) {
      // Unique match with fecha → update
      dateUpdates.push({ id: p.id, fecha: candidates[0].fecha, nombre, monto: p.monto_usd });
    } else if (candidates.length === 1 && !candidates[0].fecha) {
      needReview.push({ id: p.id, nombre, monto: p.monto_usd, cuota: p.numero_cuota, xlsxFecha: null, reason: "xlsx tiene la fila pero también sin fecha" });
    } else if (candidates.length > 1) {
      // Multiple candidates with same monto → check if any isn't already used
      const unused = candidates.find((c) => c.fecha && !sameWithFecha.some((a) => a.fecha_pago?.split("T")[0] === c.fecha));
      if (unused) {
        dateUpdates.push({ id: p.id, fecha: unused.fecha!, nombre, monto: p.monto_usd });
      } else {
        duplicates.push({ id: p.id, nombre, monto: p.monto_usd, cuota: p.numero_cuota, reason: `${candidates.length} candidates pero todos ya matcheados con otro pago del lead` });
      }
    }
  }

  console.log("═════════════════════════════════════════════════════");
  console.log(`✅ UPDATES AUTOMÁTICOS (${dateUpdates.length}) — ponerles fecha desde xlsx:`);
  for (const u of dateUpdates) console.log(`   ${u.nombre.padEnd(32)} | $${String(u.monto).padStart(6)} → ${u.fecha}`);

  console.log(`\n🗑️  DUPLICADOS (${duplicates.length}) — borrar:`);
  for (const d of duplicates) console.log(`   ${d.nombre.padEnd(32)} | $${String(d.monto).padStart(6)} c${d.cuota} | ${d.reason}`);

  console.log(`\n❓ REVIEW MANUAL (${needReview.length}) — xlsx tiene la fila pero sin fecha:`);
  for (const r of needReview) console.log(`   ${r.nombre.padEnd(32)} | $${String(r.monto).padStart(6)} c${r.cuota}`);

  console.log(`\n❌ NO EXISTEN en xlsx (${noXlsxRow.length}) — probablemente corruptos/inventados:`);
  for (const n of noXlsxRow) console.log(`   ${n.nombre.padEnd(32)} | $${String(n.monto).padStart(6)} c${n.cuota} | ticket:$${n.ticketTotal} | estado:${n.estado} | llamada:${n.leadFechaLlamada || "—"}`);

  console.log(`\n\nTotal clasificado: ${dateUpdates.length + duplicates.length + needReview.length + noXlsxRow.length} / ${dbNoFecha?.length}`);

  if (process.argv.includes("--apply")) {
    console.log("\n🚀 Aplicando...");
    for (const u of dateUpdates) {
      await sb.from("payments").update({ fecha_pago: u.fecha }).eq("id", u.id);
      console.log(`  ✓ UPDATE ${u.nombre} $${u.monto} → ${u.fecha}`);
    }
    for (const d of duplicates) {
      await sb.from("payments").delete().eq("id", d.id);
      console.log(`  ✓ DELETE DUP ${d.nombre} $${d.monto}`);
    }
  }
}

main().catch(console.error);
