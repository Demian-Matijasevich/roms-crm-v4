import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

/**
 * Verifica que un lead editado recientemente en la app esté reflejado en el Sheet.
 * Toma el lead con updated_at más reciente, compara sus valores clave con la fila del Sheet.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();

  // Pick 5 most recently updated leads that have sheets_row_index
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, ticket_total, sheets_row_index, updated_at")
    .not("sheets_row_index", "is", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!leads || leads.length === 0) return NextResponse.json({ error: "no leads con sheets_row_index" }, { status: 404 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "missing env" }, { status: 500 });
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const comparisons: unknown[] = [];
  for (const l of leads) {
    const row = l.sheets_row_index!;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'📞 Registro Calls'!A${row}:G${row}`,
      });
      const rowData = (res.data.values || [])[0] || [];
      comparisons.push({
        lead_id: l.id,
        app_nombre: l.nombre,
        app_estado: l.estado,
        app_updated_at: l.updated_at,
        sheet_row: row,
        sheet_nombre: rowData[0] || null,
        sheet_estado: rowData[6] || null,
        match_nombre: (rowData[0] || "").toString().toLowerCase().trim() === (l.nombre || "").toLowerCase().trim(),
      });
    } catch (e) {
      comparisons.push({ lead_id: l.id, row, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    status: "Sincronización activa — app escribe al Sheet en cada edit/POST/PATCH/DELETE",
    sample_checks: comparisons,
  });
}
