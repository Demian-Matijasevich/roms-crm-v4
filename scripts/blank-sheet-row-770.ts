import { google } from "googleapis";

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

  // Read row 770 first to confirm
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A770:AZ770",
  });
  console.log("Row 770 actual:", check.data.values?.[0]?.slice(0, 10));

  // Also read row 660
  const check660 = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A660:AZ660",
  });
  console.log("Row 660 actual:", check660.data.values?.[0]?.slice(0, 10));

  const nombre770 = check.data.values?.[0]?.[0] || "";
  const nombre660 = check660.data.values?.[0]?.[0] || "";

  if (!nombre770.toString().toLowerCase().includes("randazzo")) {
    console.log("⚠️ Row 770 no es Matias Randazzo, no limpio");
    return;
  }
  if (!nombre660.toString().toLowerCase().includes("randazzo")) {
    console.log("⚠️ Row 660 no es Matias Randazzo, cuidado");
    return;
  }

  // Blank out row 770 (A:AZ)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A770:AZ770",
  });
  console.log("✓ Row 770 borrada (blanqueada)");
}
main().catch(console.error);
