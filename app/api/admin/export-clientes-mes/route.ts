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

  // Build month label from YYYY-MM → "ABRIL" / "MAYO" etc.
  const monthNames = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const mesNumero = parseInt(mes.split("-")[1]);
  const mesLabel = monthNames[mesNumero - 1] || mes;
  const TAB_NUEVOS = `CIERRES ${mesLabel}`;
  const TAB_PAGOS = `TODOS LOS PAGOS ${mesLabel}`;

  // Get metadata to find existing sheets
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTabs = new Map((meta.data.sheets || []).map((s) => [s.properties?.title || "", s.properties?.sheetId ?? 0]));

  // Create tabs if they don't exist
  const addSheetRequests: Array<{ addSheet: { properties: { title: string } } }> = [];
  if (!existingTabs.has(TAB_NUEVOS)) addSheetRequests.push({ addSheet: { properties: { title: TAB_NUEVOS } } });
  if (!existingTabs.has(TAB_PAGOS)) addSheetRequests.push({ addSheet: { properties: { title: TAB_PAGOS } } });
  if (addSheetRequests.length > 0) {
    const resp = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: addSheetRequests },
    });
    for (const reply of resp.data.replies || []) {
      const props = reply.addSheet?.properties;
      if (props?.title && props.sheetId != null) existingTabs.set(props.title, props.sheetId);
    }
  }

  async function writeTab(tabName: string, rows: (string | number)[][]) {
    // Clear existing
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${tabName}'!A1:Z1000`,
    });
    // Write headers + data in one update
    const values = rows.length > 0 ? [HEADERS, ...rows] : [HEADERS];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }

  async function formatTab(tabName: string, numRows: number) {
    const sheetId = existingTabs.get(tabName);
    if (sheetId == null) return;

    const requests: object[] = [
      // Header row: bold white text, purple background
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.545, green: 0.361, blue: 0.965 }, // #8b5cf6
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              padding: { top: 8, bottom: 8, left: 8, right: 8 },
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)",
        },
      },
      // Freeze header
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
      // Data rows: vertical middle, alternating not applied by us (Google does banding)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: numRows + 1 },
          cell: { userEnteredFormat: { verticalAlignment: "MIDDLE", textFormat: { fontSize: 10 } } },
          fields: "userEnteredFormat(verticalAlignment,textFormat.fontSize)",
        },
      },
      // Currency format on col F (index 5) and G-N (6-13)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: numRows + 1, startColumnIndex: 5, endColumnIndex: 14 },
          cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "\"$\"#,##0" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      },
      // Auto-resize columns A-N
      {
        autoResizeDimensions: {
          dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 14 },
        },
      },
      // Banding (alternating row colors) — light purple tint
      {
        addBanding: {
          bandedRange: {
            range: { sheetId, startRowIndex: 0, endRowIndex: numRows + 1, startColumnIndex: 0, endColumnIndex: 14 },
            rowProperties: {
              headerColor: { red: 0.545, green: 0.361, blue: 0.965 },
              firstBandColor: { red: 1, green: 1, blue: 1 },
              secondBandColor: { red: 0.96, green: 0.94, blue: 1 }, // very light purple
            },
          },
        },
      },
    ];

    try {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    } catch (e) {
      // Banding may fail if one already exists — ignore silently
      console.warn("Format warning:", e instanceof Error ? e.message : String(e));
    }
  }

  try {
    await writeTab(TAB_NUEVOS, rowsNuevos);
    await writeTab(TAB_PAGOS, rowsPagos);
    await formatTab(TAB_NUEVOS, rowsNuevos.length);
    await formatTab(TAB_PAGOS, rowsPagos.length);
  } catch (e) {
    return NextResponse.json({ error: "Sheets write error: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mes,
    rango: { desde: monthStart, hasta: monthEnd },
    tab_nuevos: { tab: TAB_NUEVOS, count: rowsNuevos.length },
    tab_pagos: { tab: TAB_PAGOS, count: rowsPagos.length },
  });
}
