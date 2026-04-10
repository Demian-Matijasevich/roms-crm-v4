import { config } from "dotenv";
import { resolve, join } from "path";
config({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SB_URL, SB_KEY);

// ── Helpers ────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const TEAM_ALIASES: Record<string, string> = {
  valentino: "Valentino",
  valen: "Valentino",
  agustin: "Agustín",
  "agustín": "Agustín",
  "juan martin": "Juan Martín",
  "juan martín": "Juan Martín",
  fede: "Fede",
  federico: "Fede",
  guille: "Guille",
};

function resolveTeamId(raw: string | null, teamMap: Record<string, string>): string | null {
  if (!raw) return null;
  const n = normalize(raw);
  const alias = TEAM_ALIASES[n];
  if (alias) return teamMap[alias.toLowerCase()] || null;
  if (teamMap[n]) return teamMap[n];
  for (const [key, id] of Object.entries(teamMap)) {
    if (n.includes(key) || key.includes(n)) return id;
  }
  return null;
}

function normalizeReceptor(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === "n/a" || s === "undefined") return null;
  if (s === "juanma" || s === "juanma wise" || s === "juanbma") return "JUANMA";
  if (s === "fran") return "FRAN";
  if (s === "valen") return "VALEN";
  if (s === "manual") return "Manual";
  return raw.trim();
}

function mapMetodoPago(raw: string | null): string | null {
  if (!raw) return null;
  const s = normalize(raw);
  if (s.includes("cash") || s.includes("efectivo")) return "cash";
  if (s.includes("mercado") || s.includes("mp")) return "mercado_pago";
  if (s.includes("binance") || s.includes("cripto") || s.includes("crypto") || s.includes("usdt")) return "binance";
  if (s.includes("stripe") || s.includes("tarjeta") || s.includes("credito")) return "stripe";
  if (s.includes("wise")) return "wise";
  if (s.includes("transf") || s.includes("transferencia") || s.includes("pesos")) return "transferencia";
  return null;
}

function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "number") {
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString().substring(0, 10);
  }
  if (typeof value === "string") {
    const s = value.trim();
    // DD/MM/YYYY
    let m = s.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    // ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  }
  return null;
}

function fuzzyMatchLead(
  nombre: string,
  leadsByName: Record<string, string>
): string | null {
  const n = normalize(nombre);
  if (leadsByName[n]) return leadsByName[n];

  for (const [key, id] of Object.entries(leadsByName)) {
    if (key.includes(n) || n.includes(key)) return id;
  }

  const tokens = n.split(" ").filter((t) => t.length > 2);
  if (tokens.length >= 2) {
    for (const [key, id] of Object.entries(leadsByName)) {
      const keyTokens = key.split(" ");
      const matches = tokens.filter((t) =>
        keyTokens.some((kt) => kt.includes(t) || t.includes(kt))
      );
      if (matches.length >= 2) return id;
    }
  }

  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    for (const [key, id] of Object.entries(leadsByName)) {
      if (key.includes(first) && key.includes(last)) return id;
    }
  }

  return null;
}

// Dedup key: lead_id + rounded monto + date
function dedupKey(leadId: string, monto: number, fecha: string | null): string {
  return `${leadId}|${Math.round(monto)}|${fecha || "nodate"}`;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     REBUILD PAYMENTS — Clean Slate Import       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ── Load team members ───────────────────────────────────────────
  const { data: teamMembers } = await supabase.from("team_members").select("id,nombre");
  const teamMap: Record<string, string> = {};
  for (const t of teamMembers || []) {
    if (t.nombre) teamMap[t.nombre.toLowerCase()] = t.id;
  }
  console.log("Team members:", Object.keys(teamMap).join(", "));

  // ── Load leads ──────────────────────────────────────────────────
  const { data: allLeads } = await supabase.from("leads").select("id,nombre").limit(3000);
  const leadsByName: Record<string, string> = {};
  for (const l of allLeads || []) {
    if (l.nombre) leadsByName[normalize(l.nombre)] = l.id;
  }
  console.log(`Leads loaded: ${Object.keys(leadsByName).length}\n`);

  // ══════════════════════════════════════════════════════════════════
  // STEP 1: DELETE ALL EXISTING PAYMENTS
  // ══════════════════════════════════════════════════════════════════
  console.log("STEP 1: Deleting ALL existing payments...");

  // Supabase requires a filter for delete, so we delete in batches
  // First get all payment IDs
  const { data: allPayments } = await supabase.from("payments").select("id");
  const totalBefore = allPayments?.length || 0;

  if (totalBefore > 0) {
    // Delete all by selecting everything with id not null
    const { error: delError } = await supabase
      .from("payments")
      .delete()
      .not("id", "is", null);

    if (delError) {
      console.error("Error deleting payments:", delError.message);
      // Try batch delete
      const ids = allPayments!.map((p) => p.id);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        await supabase.from("payments").delete().in("id", batch);
      }
    }
  }

  // Verify deletion
  const { count: afterDelete } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true });
  console.log(`  Deleted: ${totalBefore} payments. Remaining: ${afterDelete}\n`);

  // Dedup set for the entire run
  const dedupSet = new Set<string>();
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;
  let totalNoMatch = 0;
  let totalErrors = 0;
  let leadsCreated = 0;
  const unmatchedNames: string[] = [];

  // ══════════════════════════════════════════════════════════════════
  // STEP 2: Import from FINANZAS xlsx (Feb/Mar/Apr — 59 payments)
  // ══════════════════════════════════════════════════════════════════
  console.log("STEP 2: Importing from FINANZAS PERSONALES xlsx...");

  const finanzasPath = join(
    process.env.HOME || process.env.USERPROFILE || "",
    "Downloads",
    "iclosed",
    "FINANZAS PERSONALES (1).xlsx"
  );
  const finanzasWb = XLSX.readFile(finanzasPath);
  const finanzasSheets = ["Febrero", "Marzo", "Abril"];
  let finanzasCreated = 0;

  for (const sheetName of finanzasSheets) {
    const sheet = finanzasWb.Sheets[sheetName];
    if (!sheet) {
      console.log(`  Sheet "${sheetName}" not found, skipping`);
      continue;
    }
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    let sheetCreated = 0;
    let sheetTotal = 0;

    for (const row of rows) {
      const monto =
        parseFloat(
          String(row["PAGO USD"] || "0")
            .replace(/[^0-9.,-]/g, "")
            .replace(",", ".")
        ) || 0;
      if (monto <= 0) {
        totalSkipped++;
        continue;
      }

      const alumno = (row["NOMBRE DEL ALUMNO"] || "").trim();
      if (!alumno) {
        totalSkipped++;
        continue;
      }

      let leadId = fuzzyMatchLead(alumno, leadsByName);
      if (!leadId) {
        // Create a new lead for this unmatched name
        const closerId = resolveTeamId(row["CLOSER"], teamMap);
        const newLead: Record<string, any> = {
          nombre: alumno,
          estado: "cerrado", // They paid, so they're closed
        };
        if (closerId) newLead.closer_id = closerId;

        try {
          const { data: created, error } = await supabase
            .from("leads")
            .insert(newLead)
            .select("id")
            .single();
          if (error) {
            console.log(`  Could not create lead "${alumno}": ${error.message}`);
            totalNoMatch++;
            if (!unmatchedNames.includes(alumno)) unmatchedNames.push(alumno);
            continue;
          }
          leadId = created.id;
          leadsByName[normalize(alumno)] = leadId;
          leadsCreated++;
          console.log(`  Created lead: "${alumno}" (${leadId})`);
        } catch (e: any) {
          totalNoMatch++;
          if (!unmatchedNames.includes(alumno)) unmatchedNames.push(alumno);
          continue;
        }
      }

      const fechaPago = parseExcelDate(row["FECHA DE CARGA"]);

      // Dedup
      const key = dedupKey(leadId, monto, fechaPago);
      if (dedupSet.has(key)) {
        totalDuplicates++;
        continue;
      }

      const closerId = resolveTeamId(row["CLOSER"], teamMap);
      const metodoPago = mapMetodoPago(row["Metodo de pago "] || row["Metodo de pago"]);
      const receptor = normalizeReceptor(row["recibe"] || row["Recibe"]);
      const concepto = (row["Concepto"] || "").toLowerCase();

      // Determine numero_cuota from concepto
      let numeroCuota = 1;
      if (concepto.includes("2") || concepto.includes("segunda")) numeroCuota = 2;
      else if (concepto.includes("3") || concepto.includes("tercera")) numeroCuota = 3;

      const payment: Record<string, any> = {
        lead_id: leadId,
        monto_usd: monto,
        estado: "pagado",
        fecha_pago: fechaPago,
        numero_cuota: numeroCuota,
      };
      if (receptor) payment.receptor = receptor;
      if (metodoPago) payment.metodo_pago = metodoPago;
      if (closerId) payment.cobrador_id = closerId;

      try {
        const { error } = await supabase.from("payments").insert(payment);
        if (error) {
          console.error(`  Error inserting "${alumno}" ($${monto}):`, error.message);
          totalErrors++;
        } else {
          finanzasCreated++;
          sheetCreated++;
          sheetTotal += monto;
          totalCreated++;
          dedupSet.add(key);
        }
      } catch (e: any) {
        console.error(`  Exception for "${alumno}":`, e.message);
        totalErrors++;
      }
    }

    console.log(`  ${sheetName}: ${sheetCreated} payments, $${sheetTotal.toLocaleString()}`);
  }

  console.log(`  FINANZAS total: ${finanzasCreated} payments created\n`);

  // ══════════════════════════════════════════════════════════════════
  // STEP 3: Import from CRM VENTAS — Registro Calls embedded payments
  // (Pago 1/2/3 from the "CRM Agendas" and closer-specific sheets)
  // Only add payments NOT already covered by FINANZAS
  // ══════════════════════════════════════════════════════════════════
  console.log("STEP 3: Importing embedded payments from CRM VENTAS xlsx...");

  const crmPath = join(
    process.env.HOME || process.env.USERPROFILE || "",
    "Downloads",
    "iclosed",
    "CRM VENTAS SECURE SCALE.xlsx"
  );
  const crmWb = XLSX.readFile(crmPath);
  let crmCreated = 0;

  // Check CRM Agendas and closer sheets for Pago columns
  const crmSheets = ["CRM Agendas", "VALEN CLOSING"];

  for (const sn of crmSheets) {
    const sheet = crmWb.Sheets[sn];
    if (!sheet) continue;
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const hasPago = keys.some((k) => k.toLowerCase().includes("pago"));

    if (!hasPago) {
      console.log(`  ${sn}: no payment columns found, skipping`);
      continue;
    }

    for (const row of rows) {
      const nombre = (row["Nombre"] || "").trim();
      if (!nombre) continue;

      const leadId = fuzzyMatchLead(nombre, leadsByName);
      if (!leadId) continue;

      const pagos = [
        { num: 1, monto: parseFloat(String(row["Pago 1"] || "0")) || 0, fecha: row["Fecha Pago 1"] || row["Fecha de Llamada"] },
        { num: 2, monto: parseFloat(String(row["Pago 2"] || "0")) || 0, fecha: row["Fecha Pago 2"] },
        { num: 3, monto: parseFloat(String(row["Pago 3"] || "0")) || 0, fecha: row["Fecha Pago 3"] },
      ];

      for (const p of pagos) {
        if (p.monto <= 0) continue;
        const fechaPago = parseExcelDate(p.fecha);
        const key = dedupKey(leadId, p.monto, fechaPago);
        if (dedupSet.has(key)) {
          totalDuplicates++;
          continue;
        }

        const closerId = resolveTeamId(row["Closer"], teamMap);
        const receptor = normalizeReceptor(row["Quién Recibe"] || row["Quien Recibe"]);

        const payment: Record<string, any> = {
          lead_id: leadId,
          monto_usd: p.monto,
          estado: "pagado",
          fecha_pago: fechaPago,
          numero_cuota: p.num,
        };
        if (closerId) payment.cobrador_id = closerId;
        if (receptor) payment.receptor = receptor;

        try {
          const { error } = await supabase.from("payments").insert(payment);
          if (error) {
            totalErrors++;
          } else {
            crmCreated++;
            totalCreated++;
            dedupSet.add(key);
          }
        } catch {
          totalErrors++;
        }
      }
    }
  }

  console.log(`  CRM VENTAS: ${crmCreated} additional payments created\n`);

  // ══════════════════════════════════════════════════════════════════
  // STEP 4: Final report
  // ══════════════════════════════════════════════════════════════════
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║                 FINAL REPORT                    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Query final state
  const { data: finalPayments } = await supabase
    .from("payments")
    .select("id,lead_id,monto_usd,fecha_pago,estado,receptor,numero_cuota");

  let grandTotal = 0;
  let pagadoTotal = 0;
  const byMonth: Record<string, { count: number; total: number }> = {};
  const byReceptor: Record<string, number> = {};
  const byEstado: Record<string, number> = {};

  for (const p of finalPayments || []) {
    const m = Number(p.monto_usd) || 0;
    grandTotal += m;
    byEstado[p.estado] = (byEstado[p.estado] || 0) + 1;
    if (p.estado === "pagado") pagadoTotal += m;
    if (p.receptor) byReceptor[p.receptor] = (byReceptor[p.receptor] || 0) + m;
    if (p.fecha_pago) {
      const month = p.fecha_pago.substring(0, 7);
      if (!byMonth[month]) byMonth[month] = { count: 0, total: 0 };
      byMonth[month].count++;
      byMonth[month].total += m;
    }
  }

  console.log(`Total payments in DB: ${finalPayments?.length}`);
  console.log(`Total USD: $${grandTotal.toLocaleString()}`);
  console.log(`Pagado USD: $${pagadoTotal.toLocaleString()}\n`);

  console.log("By month:");
  for (const [month, data] of Object.entries(byMonth).sort()) {
    console.log(`  ${month}: ${data.count} payments, $${data.total.toLocaleString()}`);
  }

  console.log("\nBy receptor:");
  for (const [rec, total] of Object.entries(byReceptor).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rec}: $${total.toLocaleString()}`);
  }

  console.log("\nBy estado:");
  for (const [estado, count] of Object.entries(byEstado)) {
    console.log(`  ${estado}: ${count}`);
  }

  console.log(`\n--- Import stats ---`);
  console.log(`Payments created: ${totalCreated}`);
  console.log(`  From FINANZAS: ${finanzasCreated}`);
  console.log(`  From CRM VENTAS: ${crmCreated}`);
  console.log(`Leads auto-created: ${leadsCreated}`);
  console.log(`Duplicates skipped: ${totalDuplicates}`);
  console.log(`No lead match (failed): ${totalNoMatch}`);
  console.log(`Skipped (no monto/name): ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);

  if (unmatchedNames.length > 0) {
    console.log(`\nUnmatched names (${unmatchedNames.length}):`);
    for (const n of unmatchedNames) console.log(`  - ${n}`);
  }

  // Sanity check
  // FINANZAS xlsx has 59 rows with PAGO>0, but 3 are sheet total/summary rows (no name).
  // Real payments: 56 rows, $240,270
  console.log("\n--- SANITY CHECK ---");
  console.log(`Expected from FINANZAS: 56 real payments (excl 3 sum rows), ~$240,270`);
  console.log(`Got: ${finalPayments?.length} payments, $${grandTotal.toLocaleString()}`);
  if (finanzasCreated >= 54 && Math.abs(pagadoTotal - 240270) < 5000) {
    console.log("OK — FINANZAS data imported correctly (within tolerance)");
  } else {
    console.log("CHECK — Review unmatched names and totals above");
  }
}

main().catch(console.error).finally(() => process.exit(0));
