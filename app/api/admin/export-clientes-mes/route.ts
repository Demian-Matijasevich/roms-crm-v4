import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

const DEFAULT_SPREADSHEET_ID = "1Qpm47Yaq71YHIJwA2LYjFCFj_BPNwdZ_PQ8P3AyLt1I";

const HEADERS = [
  "FECHA DE INICIO", "NOMBRE DE CLIENTE", "RUBRO/NICHO", "INSTAGRAM", "SERVICIO",
  "CUANTO PAGO", "PAGO MES 1 EDITOR", "PAGO MES 2 EDITOR", "PAGO MES 3 EDITOR", "PAGO MES 4 EDITOR",
  "PAGO 1 FILAMKER", "PAGO 2 FILMAKER", "PAGO 3 FILMAKER", "PAGO 4 FILMAKER",
];

function firstDayOfMonth(ym: string): string { return `${ym}-01`; }
function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

function programaLabel(p: string | null): string {
  if (!p) return "";
  const map: Record<string, string> = {
    roms_7: "ROMS 7",
    consultoria: "Consultoría",
    omnipresencia: "Omnipresencia",
    multicuentas: "Multicuentas",
  };
  return map[p] || p;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const spreadsheetId = url.searchParams.get("id") || DEFAULT_SPREADSHEET_ID;
  const mes = url.searchParams.get("mes") || "2026-04"; // YYYY-MM
  const dryRun = url.searchParams.get("dry") === "1";

  const monthStart = firstDayOfMonth(mes);
  const monthEnd = lastDayOfMonth(mes);

  const sb = createServerClient();

  // Fetch payments in month
  const { data: paysRaw, error: payErr } = await sb
    .from("payments")
    .select("id, client_id, lead_id, monto_usd, fecha_pago, estado")
    .eq("estado", "pagado")
    .gte("fecha_pago", monthStart)
    .lte("fecha_pago", monthEnd);
  if (payErr) return NextResponse.json({ error: "payments: " + payErr.message }, { status: 500 });

  // Unique lead ids with payment in month
  const leadIdsWithPay = [...new Set((paysRaw || []).map((p) => p.lead_id).filter((x): x is string => !!x))];

  // Fetch leads in that set + leads cerradas/adentro en el mes (para la tab de nuevos)
  const { data: leadsPaid } = leadIdsWithPay.length > 0
    ? await sb
        .from("leads")
        .select("id, nombre, instagram, programa_pitcheado, fecha_llamada, fecha_agendado, estado")
        .in("id", leadIdsWithPay)
    : { data: [] };

  // "Nuevos en el mes" = leads cerrados (o adentro_seguimiento) con fecha_llamada en el mes
  const { data: leadsNuevosRaw } = await sb
    .from("leads")
    .select("id, nombre, instagram, programa_pitcheado, fecha_llamada, fecha_agendado, estado, ticket_total")
    .gte("fecha_llamada", `${monthStart}T00:00:00`)
    .lte("fecha_llamada", `${monthEnd}T23:59:59`)
    .in("estado", ["cerrado", "adentro_seguimiento"]);

  // Group payments per lead
  const paysByLead = new Map<string, number>();
  for (const p of paysRaw || []) {
    if (!p.lead_id) continue;
    paysByLead.set(p.lead_id, (paysByLead.get(p.lead_id) || 0) + Number(p.monto_usd || 0));
  }

  // ========== TAB 1: ABRIL → Nuevos cerrados en el mes ==========
  const rowsNuevos = (leadsNuevosRaw || []).map((l) => {
    const paidInMonth = paysByLead.get(l.id) || 0;
    const fInicio = (l.fecha_llamada || l.fecha_agendado || "").split("T")[0];
    return [
      fInicio,
      l.nombre || "",
      "", // RUBRO/NICHO — manual
      l.instagram || "",
      programaLabel(l.programa_pitcheado),
      paidInMonth > 0 ? paidInMonth : (l.ticket_total || ""),
      "", "", "", "", "", "", "", "",
    ];
  }).sort((a, b) => (a[0] as string).localeCompare(b[0] as string));

  // ========== TAB 2: HISTORICO → Todos los leads con pago en el mes ==========
  const rowsPagos = (leadsPaid || []).map((l) => {
    const paidInMonth = paysByLead.get(l.id) || 0;
    const fInicio = (l.fecha_llamada || l.fecha_agendado || "").split("T")[0];
    return [
      fInicio,
      l.nombre || "",
      "",
      l.instagram || "",
      programaLabel(l.programa_pitcheado),
      paidInMonth,
      "", "", "", "", "", "", "", "",
    ];
  }).sort((a, b) => (b[5] as number) - (a[5] as number));

  if (dryRun) {
    return NextResponse.json({
      mes,
      rango: { desde: monthStart, hasta: monthEnd },
      _debug: {
        payments_raw: (paysRaw || []).length,
        unique_lead_ids_with_pay: leadIdsWithPay.length,
        leads_paid_found: (leadsPaid || []).length,
        leads_nuevos_raw: (leadsNuevosRaw || []).length,
      },
      tab_nuevos: { count: rowsNuevos.length, preview: rowsNuevos.slice(0, 10) },
      tab_pagos: { count: rowsPagos.length, preview: rowsPagos.slice(0, 10) },
    });
  }

  // Write to Sheet
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not set" }, { status: 500 });
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  async function writeTab(tabName: string, rows: (string | number)[][]) {
    // Clear existing data (rows 2 onwards)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${tabName}'!A2:Z1000`,
    });
    // Write headers (row 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    // Write data (row 2+)
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A2`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      });
    }
  }

  try {
    await writeTab("ABRIL", rowsNuevos);
    await writeTab("HISTORICO", rowsPagos);
  } catch (e) {
    return NextResponse.json({ error: "Sheets write error: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mes,
    rango: { desde: monthStart, hasta: monthEnd },
    tab_nuevos: { tab: "ABRIL", count: rowsNuevos.length },
    tab_pagos: { tab: "HISTORICO", count: rowsPagos.length },
  });
}
