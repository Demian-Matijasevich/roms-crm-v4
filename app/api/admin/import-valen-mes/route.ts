import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";
const VALEN_SPREADSHEET_ID = "1eUViIFB3NqmJP6-G28Dcxsodt_zjXpg0S5wJq_V8Gt4";

// Map mes YYYY-MM → Valen tab name
const MES_TAB: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

function normName(s: string | null): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
function parseFecha(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Formats expected: "1/4/2026" (D/M/YYYY) or "01/04/2026"
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const [, dd, mm, yy] = m;
    const y = yy.length === 2 ? "20" + yy : yy;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return null;
}
function parseMonto(v: unknown): number {
  if (v == null) return 0;
  // Spanish format: $1.234,56 → $ removed, . is thousand sep, , is decimal
  // Strategy: remove $, spaces. Drop dots (thousand sep). Replace last comma with dot for decimal.
  let s = String(v).replace(/[$\s]/g, "");
  s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function mapMetodoPago(s: string | null): string | null {
  if (!s) return null;
  const x = s.toLowerCase();
  if (x.includes("binance")) return "binance";
  if (x.includes("dolar") || x.includes("dólar") || x.includes("usd")) return "transferencia";
  if (x.includes("pesos") || x.includes("trasnf") || x.includes("transf")) return "transferencia";
  if (x.includes("cash") || x.includes("efectivo")) return "cash";
  if (x.includes("mercado")) return "mercado_pago";
  if (x.includes("stripe")) return "stripe";
  if (x.includes("wise")) return "wise";
  return "transferencia";
}
function mapReceptor(s: string | null): string | null {
  if (!s) return null;
  const x = s.toUpperCase().trim();
  if (x.includes("FRAN")) return "FRAN";
  if (x.includes("JUANMA")) return "JUANMA";
  if (x.includes("VALEN")) return "VALEN";
  if (x.includes("MEL")) return "MEL";
  return x;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mes = url.searchParams.get("mes") || "2026-04"; // YYYY-MM
  const dryRun = url.searchParams.get("dry") === "1";
  const monthNum = mes.split("-")[1];
  const tabName = MES_TAB[monthNum];
  if (!tabName) return NextResponse.json({ error: "mes inválido" }, { status: 400 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "missing env" }, { status: 500 });
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Read Valen tab
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: VALEN_SPREADSHEET_ID,
    range: `'${tabName}'!A2:O500`,
  });
  const rows = res.data.values || [];

  const sb = createServerClient();
  // Get Valen's id (and maybe FRAN/JUANMA setter ids if needed)
  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter");
  const valen = (team || []).find((t) => t.nombre.toLowerCase().startsWith("valen"));
  if (!valen) return NextResponse.json({ error: "Valen no encontrado en team_members" }, { status: 404 });

  // Existing leads (for matching)
  const { data: allLeads } = await sb
    .from("leads")
    .select("id, nombre, email, telefono, instagram, ticket_total, programa_pitcheado, fecha_llamada, fecha_agendado, closer_id, setter_id, sheets_row_index")
    .range(0, 9999);
  type LeadLite = { id: string; nombre: string; email: string | null; telefono: string | null; instagram: string | null; ticket_total: number; programa_pitcheado: string | null; fecha_llamada: string | null; fecha_agendado: string | null; closer_id: string | null; setter_id: string | null; sheets_row_index: number | null };
  const leadByName = new Map<string, LeadLite>();
  for (const l of (allLeads || []) as LeadLite[]) leadByName.set(normName(l.nombre), l);

  // Existing payments (for dedup): same lead + same amount + same fecha
  const { data: allPays } = await sb.from("payments").select("id, lead_id, monto_usd, fecha_pago, numero_cuota");
  const paysKeySet = new Set<string>();
  for (const p of allPays || []) {
    const k = `${p.lead_id}|${Math.round(p.monto_usd)}|${(p.fecha_pago || "").split("T")[0]}`;
    paysKeySet.add(k);
  }

  // Process rows
  const plan: Array<{
    row: number;
    fecha: string | null;
    nombre: string;
    monto: number;
    concepto: string;
    metodo: string | null;
    receptor: string | null;
    action: string;
    lead_id?: string;
    matched_existing?: boolean;
    error?: string;
  }> = [];
  let createdLeads = 0, createdPays = 0, skipped = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    const fecha = parseFecha(r[0]);
    const programa = (r[1] || "").toString().trim();
    const nombre = (r[2] || "").toString().trim();
    const telefono = (r[3] || "").toString().trim() || null;
    const monto = parseMonto(r[4]);
    const concepto = (r[5] || "").toString().trim();
    const _closer = (r[6] || "").toString().trim();
    const _setter = (r[7] || "").toString().trim();
    const metodo = mapMetodoPago((r[8] || "").toString());
    const receptor = mapReceptor((r[9] || "").toString());
    void _closer; void _setter; // ya sabemos que es Valen siempre en este Sheet

    if (!nombre || !fecha || monto <= 0) {
      skipped++;
      continue;
    }

    // Find or "create" lead by name match
    const key = normName(nombre);
    let existing = leadByName.get(key);
    let leadId: string | null = existing?.id || null;
    let matchedExisting = !!existing;

    if (!existing) {
      // Create lead with Valen as closer + setter
      if (!dryRun) {
        const { data: ins, error: insErr } = await sb
          .from("leads")
          .insert({
            nombre,
            telefono,
            estado: "cerrado",
            closer_id: valen.id,
            setter_id: valen.id,
            fecha_llamada: `${fecha}T00:00:00`,
            fecha_agendado: `${fecha}T00:00:00`,
            programa_pitcheado: null, // EDITOR no es enum válido
            ticket_total: 0,
            fuente: null,
          })
          .select("id, nombre")
          .single();
        if (insErr || !ins) {
          errors++;
          plan.push({ row: rowNum, fecha, nombre, monto, concepto, metodo, receptor, action: "lead_insert_failed", error: insErr?.message });
          continue;
        }
        leadId = ins.id;
        leadByName.set(key, { id: ins.id, nombre: ins.nombre, email: null, telefono, instagram: null, ticket_total: 0, programa_pitcheado: null, fecha_llamada: fecha, fecha_agendado: fecha, closer_id: valen.id, setter_id: valen.id, sheets_row_index: null });
        createdLeads++;
      } else {
        plan.push({ row: rowNum, fecha, nombre, monto, concepto, metodo, receptor, action: "would_create_lead+payment" });
        continue;
      }
    }

    // Check payment dedup
    const payKey = `${leadId}|${Math.round(monto)}|${fecha}`;
    if (paysKeySet.has(payKey)) {
      skipped++;
      plan.push({ row: rowNum, fecha, nombre, monto, concepto, metodo, receptor, action: "skipped_duplicate_payment", lead_id: leadId!, matched_existing: matchedExisting });
      continue;
    }

    // Determine numero_cuota by concepto
    let numeroCuota = 1;
    const c = concepto.toLowerCase();
    if (c.includes("segunda") || c.includes("2da") || c.includes("2°")) numeroCuota = 2;
    else if (c.includes("tercera") || c.includes("3ra")) numeroCuota = 3;
    else if (c.includes("fee")) numeroCuota = 1;

    if (!dryRun && leadId) {
      const { error: payErr } = await sb.from("payments").insert({
        lead_id: leadId,
        client_id: null,
        renewal_id: null,
        numero_cuota: numeroCuota,
        monto_usd: monto,
        monto_ars: 0,
        fecha_pago: fecha,
        fecha_vencimiento: null,
        estado: "pagado",
        metodo_pago: metodo,
        receptor,
        verificado: false,
        es_renovacion: false,
      });
      if (payErr) {
        errors++;
        plan.push({ row: rowNum, fecha, nombre, monto, concepto, metodo, receptor, action: "payment_insert_failed", error: payErr.message });
        continue;
      }
      paysKeySet.add(payKey);
      createdPays++;
      // Sync the lead to the Sheet (fire-and-forget)
      syncLeadToSheet(leadId).catch(() => null);
    }

    plan.push({
      row: rowNum,
      fecha,
      nombre,
      monto,
      concepto,
      metodo,
      receptor,
      action: matchedExisting ? "payment_added_to_existing_lead" : "created_lead+payment",
      lead_id: leadId!,
      matched_existing: matchedExisting,
    });
  }

  return NextResponse.json({
    ok: true,
    mes,
    tab: tabName,
    total_rows: rows.length,
    created_leads: createdLeads,
    created_payments: createdPays,
    skipped,
    errors,
    dry_run: dryRun,
    sample: plan.slice(0, 60),
  });
}
