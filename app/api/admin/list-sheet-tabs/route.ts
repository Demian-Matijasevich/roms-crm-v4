import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "missing env" }, { status: 500 });
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const tabs = (meta.data.sheets || []).map((s) => ({
    title: s.properties?.title,
    id: s.properties?.sheetId,
    rows: s.properties?.gridProperties?.rowCount,
    cols: s.properties?.gridProperties?.columnCount,
  }));

  // Also fetch first row of each as header preview
  const headers: Record<string, string[]> = {};
  for (const t of tabs) {
    if (!t.title) continue;
    try {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${t.title}'!A1:Z1`,
      });
      headers[t.title] = (r.data.values?.[0] || []).map((v) => String(v || ""));
    } catch {
      headers[t.title] = [];
    }
  }

  return NextResponse.json({ tabs, headers });
}
