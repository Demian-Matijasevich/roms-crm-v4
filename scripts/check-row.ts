import { config } from "dotenv";
config({ path: ".env.local" });
import { google } from "googleapis";

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4",
    range: "'📞 Registro Calls'!A727:Y727",
  });

  const d = res.data.values?.[0] || [];
  console.log("Row 727:");
  console.log("  A (Nombre):", d[0] || "EMPTY");
  console.log("  L (CtxSetter):", d[11] || "EMPTY");
  console.log("  M (CashDia1):", d[12] || "EMPTY");
  console.log("  N (CashTotal):", d[13] || "EMPTY");
  console.log("  O (TicketTotal):", d[14] || "EMPTY");
  console.log("  P (PlanPago):", d[15] || "EMPTY");
  console.log("  Q (Pago1):", d[16] || "EMPTY");
  console.log("  R (EstadoP1):", d[17] || "EMPTY");
  console.log("  S (FechaP1):", d[18] || "EMPTY");
  console.log("  T (Pago2):", d[19] || "EMPTY");
  console.log("  Y (MetodoPago):", d[24] || "EMPTY");
  console.log("  Raw length:", d.length);
  console.log("  All non-empty:", d.filter(Boolean).join(" | "));

  // Also read header row
  const hres = await sheets.spreadsheets.values.get({
    spreadsheetId: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4",
    range: "'📞 Registro Calls'!A1:AZ1",
  });
  const h = hres.data.values?.[0] || [];
  console.log("\nActual headers:");
  for (let i = 0; i < h.length; i++) {
    const col = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    console.log(`  ${col} (${i}): ${h[i]}`);
  }
}

main().catch(console.error);
