import { config } from "dotenv";
import { resolve, join } from "path";
config({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SB_URL, SB_KEY);

// ── Name normalization ──────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// ── Team name mapping ───────────────────────────────────────────────
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
  // Direct alias
  const alias = TEAM_ALIASES[n];
  if (alias) return teamMap[alias.toLowerCase()] || null;
  // Direct match
  if (teamMap[n]) return teamMap[n];
  // Partial match
  for (const [key, id] of Object.entries(teamMap)) {
    if (n.includes(key) || key.includes(n)) return id;
  }
  return null;
}

// ── metodo_pago mapping ─────────────────────────────────────────────
// DB enum: mercado_pago, transferencia, cash, binance, stripe, wise
function mapMetodoPago(raw: string | null): string | null {
  if (!raw) return null;
  const s = normalize(raw);
  if (s.includes("cash") || s.includes("efectivo")) return "cash";
  if (s.includes("mercado") || s.includes("mp")) return "mercado_pago";
  if (s.includes("binance") || s.includes("cripto") || s.includes("crypto") || s.includes("usdt")) return "binance";
  if (s.includes("stripe") || s.includes("tarjeta") || s.includes("credito")) return "stripe";
  if (s.includes("wise")) return "wise";
  if (s.includes("transf") || s.includes("transferencia") || s.includes("dolar transf") || s.includes("pesos")) return "transferencia";
  return null;
}

// ── Excel date parser ───────────────────────────────────────────────
function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "number") {
    // Excel serial → JS Date
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString().substring(0, 10);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  }
  return null;
}

// ── Fuzzy lead match ────────────────────────────────────────────────
function fuzzyMatchLead(
  nombre: string,
  leadsByName: Record<string, string>
): string | null {
  const n = normalize(nombre);
  // Exact
  if (leadsByName[n]) return leadsByName[n];

  // Contains (both directions)
  for (const [key, id] of Object.entries(leadsByName)) {
    if (key.includes(n) || n.includes(key)) return id;
  }

  // Token overlap (at least 2 tokens match)
  const tokens = n.split(" ").filter((t) => t.length > 2);
  if (tokens.length >= 2) {
    for (const [key, id] of Object.entries(leadsByName)) {
      const keyTokens = key.split(" ");
      const matches = tokens.filter((t) => keyTokens.some((kt) => kt.includes(t) || t.includes(kt)));
      if (matches.length >= 2) return id;
    }
  }

  // First + last name
  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    for (const [key, id] of Object.entries(leadsByName)) {
      if (key.includes(first) && key.includes(last)) return id;
    }
  }

  return null;
}

async function main() {
  const filePath = join(
    process.env.HOME || process.env.USERPROFILE || "",
    "Downloads",
    "iclosed",
    "FINANZAS PERSONALES (1).xlsx"
  );

  console.log(`Reading: ${filePath}`);
  const workbook = XLSX.readFile(filePath);

  // ── Load team members ───────────────────────────────────────────
  const { data: teamMembers } = await supabase.from("team_members").select("id,nombre");
  const teamMap: Record<string, string> = {};
  for (const t of teamMembers || []) {
    if (t.nombre) teamMap[t.nombre.toLowerCase()] = t.id;
  }
  console.log("Team members:", Object.keys(teamMap).join(", "));

  // ── Load leads for name matching ────────────────────────────────
  const { data: allLeads } = await supabase.from("leads").select("id,nombre").limit(3000);
  const leadsByName: Record<string, string> = {};
  for (const l of allLeads || []) {
    if (l.nombre) leadsByName[normalize(l.nombre)] = l.id;
  }
  console.log(`Leads loaded: ${Object.keys(leadsByName).length}`);

  // ── Load existing payments for dedup ────────────────────────────
  const { data: existingPayments } = await supabase
    .from("payments")
    .select("id,lead_id,monto_usd,fecha_pago")
    .eq("estado", "pagado");
  const existingSet = new Set<string>();
  for (const p of existingPayments || []) {
    if (p.lead_id && p.monto_usd && p.fecha_pago) {
      existingSet.add(`${p.lead_id}|${p.monto_usd}|${p.fecha_pago}`);
    }
  }
  console.log(`Existing payments (for dedup): ${existingSet.size}`);

  const sheets = ["Febrero", "Marzo", "Abril"];
  let created = 0,
    skipped = 0,
    duplicates = 0,
    noMatch = 0,
    errors = 0;
  const unmatched: string[] = [];

  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.log(`Sheet "${sheetName}" not found, skipping`);
      continue;
    }
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    console.log(`\n--- ${sheetName}: ${rows.length} rows ---`);

    for (const row of rows) {
      const monto = parseFloat(String(row["PAGO USD"] || "0").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
      if (monto <= 0) {
        skipped++;
        continue;
      }

      const alumno = (row["NOMBRE DEL ALUMNO"] || "").trim();
      if (!alumno) {
        skipped++;
        continue;
      }

      // Match lead
      const leadId = fuzzyMatchLead(alumno, leadsByName);
      if (!leadId) {
        noMatch++;
        if (!unmatched.includes(alumno)) unmatched.push(alumno);
        // Still create the payment without lead_id? No — skip for data integrity
        continue;
      }

      const fechaPago = parseExcelDate(row["FECHA DE CARGA"]);

      // Dedup check
      const dedupKey = `${leadId}|${monto}|${fechaPago}`;
      if (existingSet.has(dedupKey)) {
        duplicates++;
        continue;
      }

      const closerId = resolveTeamId(row["CLOSER"], teamMap);
      const setterId = resolveTeamId(row["SETTER"], teamMap);
      const metodoPago = mapMetodoPago(row["Metodo de pago "] || row["Metodo de pago"]);
      const receptor = row["recibe"] ? String(row["recibe"]).trim() : null;

      const payment: Record<string, any> = {
        lead_id: leadId,
        monto_usd: monto,
        estado: "pagado",
        fecha_pago: fechaPago,
        numero_cuota: 1,
      };
      if (receptor) payment.receptor = receptor;
      if (metodoPago) payment.metodo_pago = metodoPago;
      if (closerId) payment.cobrador_id = closerId;

      try {
        const { error } = await supabase.from("payments").insert(payment);
        if (error) {
          console.error(`Error inserting payment for "${alumno}" ($${monto}):`, error.message);
          errors++;
        } else {
          created++;
          existingSet.add(dedupKey); // prevent dups within same run
        }
      } catch (e: any) {
        console.error(`Exception for "${alumno}":`, e.message);
        errors++;
      }
    }
  }

  console.log("\n=== FINANZAS Import Complete ===");
  console.log(`Created: ${created}`);
  console.log(`Duplicates skipped: ${duplicates}`);
  console.log(`No lead match: ${noMatch}`);
  console.log(`Skipped (no monto/name): ${skipped}`);
  console.log(`Errors: ${errors}`);
  if (unmatched.length > 0) {
    console.log(`\nUnmatched names (${unmatched.length}):`);
    for (const n of unmatched) console.log(`  - ${n}`);
  }

  // Final count
  const { count } = await supabase.from("payments").select("*", { count: "exact", head: true });
  console.log(`\nTotal payments in DB: ${count}`);
}

main().catch(console.error).finally(() => process.exit(0));
