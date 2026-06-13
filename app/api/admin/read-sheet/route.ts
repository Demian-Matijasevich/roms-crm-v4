import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const spreadsheetId = url.searchParams.get("id");
  const gid = url.searchParams.get("gid"); // optional
  if (!spreadsheetId) return NextResponse.json({ error: "id param required" }, { status: 400 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not set" }, { status: 500 });

  try {
    const creds = JSON.parse(raw);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // Fetch metadata to get all tabs
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabs = (meta.data.sheets || []).map((s) => ({
      title: s.properties?.title || null,
      sheetId: s.properties?.sheetId,
      rows: s.properties?.gridProperties?.rowCount,
      cols: s.properties?.gridProperties?.columnCount,
    }));

    // If gid provided, find matching tab; otherwise use first
    let targetTab = tabs[0];
    if (gid) {
      const match = tabs.find((t) => String(t.sheetId) === gid);
      if (match) targetTab = match;
    }

    const range = `'${targetTab?.title}'!A1:Z50`;
    const values = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    return NextResponse.json({
      title: meta.data.properties?.title,
      all_tabs: tabs,
      selected_tab: targetTab?.title,
      range,
      rows: values.data.values || [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
