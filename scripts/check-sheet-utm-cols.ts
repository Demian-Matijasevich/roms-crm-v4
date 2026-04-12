import { config } from "dotenv";
config({ path: ".env.local" });
import { google } from "googleapis";

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

  const hdr = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A1:BZ1",
  });
  const headers = hdr.data.values?.[0] || [];
  console.log("ALL Sheet headers:");
  for (let i = 0; i < headers.length; i++) {
    const col = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    console.log(`  ${col} (${i}): ${headers[i]}`);
  }
}
main().catch(console.error);
