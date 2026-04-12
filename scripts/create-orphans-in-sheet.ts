import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
const SHEET = "'📞 Registro Calls'";

const ORPHAN_NAMES = ["Saba", "Rodrigo Bailone", "IRENO", "Rodrigo De Loredo", "Pedro Agüero"];

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, ticket_total, sheets_row_index")
    .in("nombre", ORPHAN_NAMES);

  if (!leads?.length) {
    console.log("No orphans found");
    return;
  }

  const { data: payments } = await sb
    .from("payments")
    .select("monto_usd, fecha_pago, receptor, metodo_pago, lead_id")
    .eq("estado", "pagado")
    .in("lead_id", leads.map((l) => l.id));

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET}!A:A`,
  });
  const nextRow = (existing.data.values?.length || 0) + 1;
  console.log(`Next empty row: ${nextRow}`);

  const updates: { range: string; values: (string | number)[][] }[] = [];
  let row = nextRow;

  for (const lead of leads) {
    if (lead.sheets_row_index) {
      console.log(`  ${lead.nombre} already has row ${lead.sheets_row_index}, skipping`);
      continue;
    }

    const leadPayments = (payments || []).filter((p) => p.lead_id === lead.id);
    const p1 = leadPayments[0];
    const p2 = leadPayments[1];
    const p3 = leadPayments[2];
    const totalCash = leadPayments.reduce((s, pp) => s + pp.monto_usd, 0);

    console.log(`  ${lead.nombre} → row ${row} (${leadPayments.length} pagos, total ${totalCash})`);

    updates.push({ range: `${SHEET}!A${row}`, values: [[lead.nombre]] });
    updates.push({ range: `${SHEET}!G${row}`, values: [[lead.estado === "adentro_seguimiento" ? "Adentro Seguimiento" : "Cerrado"]] });
    updates.push({ range: `${SHEET}!M${row}`, values: [[p1?.monto_usd || ""]] });
    updates.push({ range: `${SHEET}!N${row}`, values: [[totalCash]] });
    updates.push({ range: `${SHEET}!O${row}`, values: [[lead.ticket_total || totalCash]] });
    updates.push({ range: `${SHEET}!Q${row}`, values: [[p1?.monto_usd || ""]] });
    updates.push({ range: `${SHEET}!R${row}`, values: [[p1 ? "Pagado" : ""]] });
    updates.push({ range: `${SHEET}!S${row}`, values: [[p1?.fecha_pago?.split("T")[0] || ""]] });
    updates.push({ range: `${SHEET}!T${row}`, values: [[p2?.monto_usd || ""]] });
    updates.push({ range: `${SHEET}!U${row}`, values: [[p2 ? "Pagado" : ""]] });
    updates.push({ range: `${SHEET}!V${row}`, values: [[p3?.monto_usd || ""]] });
    updates.push({ range: `${SHEET}!W${row}`, values: [[p3 ? "Pagado" : ""]] });
    const metodo = p1?.metodo_pago ? p1.metodo_pago.charAt(0).toUpperCase() + p1.metodo_pago.slice(1) : "";
    updates.push({ range: `${SHEET}!Y${row}`, values: [[metodo]] });
    updates.push({ range: `${SHEET}!AS${row}`, values: [[p1?.receptor || ""]] });

    await sb.from("leads").update({ sheets_row_index: row }).eq("id", lead.id);
    row++;
  }

  if (updates.length === 0) {
    console.log("Nothing to write");
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });

  console.log(`\nDone! Wrote ${updates.length} cells across rows ${nextRow}-${row - 1}`);
}

main().catch(console.error);
