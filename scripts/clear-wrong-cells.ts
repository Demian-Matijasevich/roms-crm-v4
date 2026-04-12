import { config } from "dotenv";
config({ path: ".env.local" });
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
  const SHEET = "'📞 Registro Calls'";

  const { data: payments } = await sb.from("payments").select("lead_id").eq("estado", "pagado");
  const { data: leads } = await sb.from("leads").select("id,estado,sheets_row_index").not("sheets_row_index", "is", null);

  const leadMap: Record<string, (typeof leads extends (infer T)[] | null ? T : never)> = {};
  for (const l of leads || []) leadMap[l.id] = l;

  const rows = new Set<number>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    const lead = leadMap[p.lead_id];
    if (lead && (lead.estado === "cerrado" || lead.estado === "adentro_seguimiento") && lead.sheets_row_index) {
      rows.add(lead.sheets_row_index);
    }
  }

  console.log(`Clearing wrong data from ${rows.size} rows (columns M and Q)...`);

  const clears: { range: string; values: string[][] }[] = [];
  for (const row of rows) {
    // Clear ALL payment columns that might have wrong data from previous runs
    // N, O, P, R, S, T, U, V, W, X, Z, AT — all columns we ever wrote to
    for (const col of ["N", "O", "P", "R", "S", "T", "U", "V", "W", "X", "Z", "AT"]) {
      clears.push({ range: `${SHEET}!${col}${row}`, values: [[""]] });
    }
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "RAW", data: clears },
  });

  console.log(`Done! Cleared ${clears.length} cells.`);
}

main().catch(console.error);
