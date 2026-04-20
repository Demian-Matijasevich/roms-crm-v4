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

  // Fetch clients + their linked lead (for Instagram)
  const { data: clientsRaw, error: cliErr } = await sb
    .from("clients")
    .select("id, nombre, programa, fecha_onboarding, lead_id, lead:leads!clients_lead_id_fkey(instagram)")
    .range(0, 4999);
  if (cliErr) return NextResponse.json({ error: "clients: " + cliErr.message }, { status: 500 });

  // Fetch payments in month
  const { data: paysRaw, error: payErr } = await sb
    .from("payments")
    .select("id, client_id, lead_id, monto_usd, fecha_pago, estado")
    .eq("estado", "pagado")
    .gte("fecha_pago", monthStart)
    .lte("fecha_pago", monthEnd);
  if (payErr) return NextResponse.json({ error: "payments: " + payErr.message }, { status: 500 });

  // Build lookup client by lead_id for payments that don't have client_id but have lead_id
  const clientByLeadId = new Map<string, typeof clientsRaw[number]>();
  const clientById = new Map<string, typeof clientsRaw[number]>();
  for (const c of clientsRaw || []) {
    clientById.set(c.id, c);
    if (c.lead_id) clientByLeadId.set(c.lead_id, c);
  }

  // Group payments per client
  const paysByClient = new Map<string, number>(); // client_id → total $
  for (const p of paysRaw || []) {
    let cid = p.client_id;
    if (!cid && p.lead_id) cid = clientByLeadId.get(p.lead_id)?.id || null;
    if (!cid) continue;
    paysByClient.set(cid, (paysByClient.get(cid) || 0) + Number(p.monto_usd || 0));
  }

  // ========== TAB 1: ABRIL → Nuevos clientes en el mes ==========
  const nuevos = (clientsRaw || []).filter((c) => {
    if (!c.fecha_onboarding) return false;
    const f = c.fecha_onboarding.split("T")[0];
    return f >= monthStart && f <= monthEnd;
  });
  const rowsNuevos = nuevos.map((c) => {
    const lead = (c.lead as { instagram?: string } | null) || null;
    const paidInMonth = paysByClient.get(c.id) || 0;
    return [
      c.fecha_onboarding?.split("T")[0] || "",
      c.nombre || "",
      "", // RUBRO/NICHO — no lo tenemos
      lead?.instagram || "",
      programaLabel(c.programa),
      paidInMonth > 0 ? paidInMonth : "",
      "", "", "", "", "", "", "", "", // Editor/Filmaker — manual
    ];
  });

  // ========== TAB 2: HISTORICO → Todos los clientes con pago en el mes ==========
  const clientsWithPayment = [...paysByClient.keys()]
    .map((id) => clientById.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const rowsPagos = clientsWithPayment.map((c) => {
    const lead = (c.lead as { instagram?: string } | null) || null;
    const paidInMonth = paysByClient.get(c.id) || 0;
    return [
      c.fecha_onboarding?.split("T")[0] || "",
      c.nombre || "",
      "",
      lead?.instagram || "",
      programaLabel(c.programa),
      paidInMonth,
      "", "", "", "", "", "", "", "",
    ];
  })
  .sort((a, b) => (b[5] as number) - (a[5] as number));

  if (dryRun) {
    return NextResponse.json({
      mes,
      rango: { desde: monthStart, hasta: monthEnd },
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
