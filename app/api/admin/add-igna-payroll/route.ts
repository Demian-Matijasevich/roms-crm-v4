import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
const TAB = "'👥 Payroll'";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "missing env" }, { status: 500 });
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Read current rows to find next empty row + avoid duplicates
  const { data: read } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1:F20`,
  });
  const rows = read.values || [];

  // Check if Igna already exists
  const exists = rows.some((r) => (r[1] || "").toLowerCase().includes("igna"));
  if (exists) {
    return NextResponse.json({ ok: false, message: "Igna ya está en Payroll", rows });
  }

  // Find next number
  let nextNum = 1;
  for (const r of rows) {
    const n = parseInt(r[0] || "0");
    if (Number.isFinite(n) && n >= nextNum) nextNum = n + 1;
  }

  // Find first empty row (after the last data row)
  const nextRowIdx = rows.length + 1; // 1-indexed

  // Append
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A${nextRowIdx}:F${nextRowIdx}`,
    valueInputOption: "RAW",
    requestBody: { values: [[String(nextNum), "Igna", "", "", "", "Setter"]] },
  });

  return NextResponse.json({ ok: true, added_row: nextRowIdx, numero: nextNum });
}
