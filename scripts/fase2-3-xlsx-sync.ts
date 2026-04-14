import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const FINANZAS = "C:\\Users\\matyc\\Downloads\\Nueva carpeta (2)\\FINANZAS PERSONALES (1).xlsx";
const APPLY = process.argv.includes("--apply");

function parseExcelDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date((v - 25569) * 86400 * 1000).toISOString().split("T")[0];
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { const [_, dd, mm, yy] = m; const y = yy.length === 2 ? "20" + yy : yy; return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; }
  }
  return null;
}

function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

type XlsxPay = { nombre: string; monto: number; fecha: string | null; concepto: string; mes: string; recibe: string };

async function main() {
  // Parse xlsx
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
  console.log(`📄 xlsx: ${xlsxPays.length} pagos`);

  // Fetch all Supabase leads + payments
  const { data: allLeads } = await sb
    .from("leads")
    .select("id, nombre, estado, fecha_llamada, ticket_total, sheets_row_index")
    .range(0, 4999);
  const { data: allPays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado, receptor")
    .eq("estado", "pagado")
    .range(0, 4999);

  // Plans
  const adoptOrphan: { payId: string; leadId: string; nombre: string; monto: number }[] = [];
  const adoptOrphanToNewLead: { payId: string; nombre: string }[] = [];
  const updateFecha: { payId: string; fecha: string; info: string }[] = [];
  const createLead: { nombre: string; fecha: string; estado: string; ticket: number }[] = [];
  const createPayment: { xlsx: XlsxPay; leadName: string }[] = [];
  const alreadyOk: XlsxPay[] = [];

  for (const x of xlsxPays) {
    const needleWords = norm(x.nombre).split(" ").filter((w) => w.length > 2);
    if (needleWords.length === 0) continue;

    // STRICT matching: all needle words must appear in lead name,
    // AND lead name must contain at least one "distinctive" word (>3 chars) from needle
    const matchingLeads = (allLeads || []).filter((l) => {
      const ln = norm(l.nombre);
      // all words present
      if (!needleWords.every((w) => ln.includes(w))) return false;
      return true;
    });

    // Find existing payment that matches this xlsx row (monto close + fecha close)
    const existingPay = (allPays || []).find((p) => {
      if (Math.abs(p.monto_usd - x.monto) > 0.5) return false;
      const pFecha = p.fecha_pago?.split("T")[0];
      if (x.fecha && pFecha === x.fecha) return true;
      if (!pFecha && matchingLeads.some((l) => l.id === p.lead_id)) return true;
      return false;
    });

    // Secondary match: same lead + same monto + existing has a different fecha → assume it's the same payment with wrong fecha
    const samePay = !existingPay && matchingLeads.length > 0
      ? (allPays || []).find((p) => matchingLeads.some((l) => l.id === p.lead_id) && Math.abs(p.monto_usd - x.monto) < 0.5)
      : null;

    if (existingPay) {
      if (!existingPay.lead_id && matchingLeads.length > 0) {
        adoptOrphan.push({ payId: existingPay.id, leadId: matchingLeads[0].id, nombre: x.nombre, monto: x.monto });
      } else if (!existingPay.lead_id && matchingLeads.length === 0) {
        // Orphan with no matching lead: create lead and link
        createLead.push({ nombre: x.nombre, fecha: x.fecha || "", estado: "cerrado", ticket: x.monto });
        adoptOrphanToNewLead.push({ payId: existingPay.id, nombre: x.nombre });
      } else if (!existingPay.fecha_pago && x.fecha) {
        updateFecha.push({ payId: existingPay.id, fecha: x.fecha, info: `${x.nombre} $${x.monto}` });
      } else {
        alreadyOk.push(x);
      }
      continue;
    }

    if (samePay) {
      if (x.fecha) {
        updateFecha.push({ payId: samePay.id, fecha: x.fecha, info: `${x.nombre} $${x.monto} (fix fecha)` });
      } else {
        alreadyOk.push(x); // xlsx sin fecha, DB tiene el pago — considerar match
      }
      continue;
    }

    // No existing payment. Need to create.
    if (matchingLeads.length === 0) {
      // No lead either — need to create both
      createLead.push({ nombre: x.nombre, fecha: x.fecha || "", estado: "cerrado", ticket: x.monto });
      createPayment.push({ xlsx: x, leadName: x.nombre });
    } else {
      createPayment.push({ xlsx: x, leadName: matchingLeads[0].nombre });
    }
  }

  console.log(`\n📋 Plan:`);
  console.log(`  Ya ok: ${alreadyOk.length}`);
  console.log(`  Adoptar huérfanos a lead existente: ${adoptOrphan.length}`);
  for (const a of adoptOrphan) console.log(`    ${a.nombre} $${a.monto} → linkar a lead`);
  console.log(`  Adoptar huérfanos a lead NUEVO: ${adoptOrphanToNewLead.length}`);
  for (const a of adoptOrphanToNewLead) console.log(`    ${a.nombre} → crear lead + link`);
  console.log(`  Update fecha: ${updateFecha.length}`);
  for (const u of updateFecha) console.log(`    ${u.info} → ${u.fecha}`);
  console.log(`  Crear leads nuevos: ${createLead.length}`);
  for (const l of createLead) console.log(`    ${l.nombre} | ${l.fecha} | ticket:$${l.ticket}`);
  console.log(`  Crear pagos: ${createPayment.length}`);
  for (const c of createPayment) console.log(`    ${c.xlsx.nombre.padEnd(40)} $${String(c.xlsx.monto).padStart(6)} | ${c.xlsx.fecha || "—"} | ${c.xlsx.concepto}`);

  if (!APPLY) { console.log("\n(dry run — pasá --apply)"); return; }

  console.log("\n🚀 Aplicando...");

  // 1. Adopt orphans (update lead_id)
  for (const a of adoptOrphan) {
    const { error } = await sb.from("payments").update({ lead_id: a.leadId }).eq("id", a.payId);
    if (error) console.error(`  ❌ ${a.nombre}: ${error.message}`);
    else console.log(`  ✓ adopt ${a.nombre}`);
  }

  // 2. Update fechas
  for (const u of updateFecha) {
    const { error } = await sb.from("payments").update({ fecha_pago: u.fecha }).eq("id", u.payId);
    if (error) console.error(`  ❌ ${u.info}: ${error.message}`);
    else console.log(`  ✓ fecha ${u.info}`);
  }

  // 3. Create new leads (dedup by name)
  const nameToId: Record<string, string> = {};
  for (const l of createLead) {
    const key = norm(l.nombre);
    if (nameToId[key]) continue; // already created in this pass
    // Check if it was created mid-batch by previous iteration
    const { data: existing } = await sb.from("leads").select("id").ilike("nombre", l.nombre).limit(1);
    if (existing && existing.length > 0) { nameToId[key] = existing[0].id; continue; }

    const { data: inserted, error } = await sb
      .from("leads")
      .insert({
        nombre: l.nombre,
        estado: l.estado,
        fecha_llamada: l.fecha || null,
        ticket_total: l.ticket,
        fuente: "otro",
      })
      .select("id")
      .single();
    if (error) { console.error(`  ❌ create lead ${l.nombre}: ${error.message}`); continue; }
    nameToId[key] = inserted.id;
    console.log(`  ✓ created lead ${l.nombre}`);
  }

  // 3b. Adopt orphans to new leads
  for (const a of adoptOrphanToNewLead) {
    const key = norm(a.nombre);
    const leadId = nameToId[key];
    if (!leadId) { console.error(`  ❌ no lead for orphan ${a.nombre}`); continue; }
    const { error } = await sb.from("payments").update({ lead_id: leadId }).eq("id", a.payId);
    if (error) console.error(`  ❌ adopt ${a.nombre}: ${error.message}`);
    else console.log(`  ✓ adopt-new ${a.nombre}`);
  }

  // 4. Create payments
  for (const c of createPayment) {
    const key = norm(c.leadName);
    let leadId = nameToId[key];
    if (!leadId) {
      // Lookup existing lead
      const { data: existing } = await sb.from("leads").select("id").ilike("nombre", c.leadName).limit(1);
      if (existing && existing.length > 0) leadId = existing[0].id;
    }
    if (!leadId) { console.error(`  ❌ no lead for ${c.leadName}`); continue; }

    const { error } = await sb.from("payments").insert({
      lead_id: leadId,
      monto_usd: c.xlsx.monto,
      monto_ars: 0,
      fecha_pago: c.xlsx.fecha,
      estado: "pagado",
      numero_cuota: 1,
      receptor: c.xlsx.recibe || null,
      metodo_pago: null,
      es_renovacion: false,
    });
    if (error) console.error(`  ❌ pay ${c.xlsx.nombre}: ${error.message}`);
    else console.log(`  ✓ pay ${c.xlsx.nombre} $${c.xlsx.monto}`);
  }

  console.log("\n✅ Fase 2+3 completa");
}

main().catch(console.error);
