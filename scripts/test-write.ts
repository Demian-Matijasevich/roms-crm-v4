import { config } from "dotenv";
config({ path: ".env.local" });
import { google } from "googleapis";

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

  // Direct write to Matias Randazzo row 727
  console.log("Writing Pago 1 = 10000, Estado = Pagado, Fecha = 2026-04-07 to row 727...");

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!Q727:Y727",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[10000, "Pagado", "2026-04-07", 20000, "Pagado", "", "", "", "Binance"]],
    },
  });
  console.log("Updated:", res.data.updatedCells, "cells");

  // Verify
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!Q727:Y727",
  });
  console.log("Verify:", check.data.values);
}

main().catch(console.error);
