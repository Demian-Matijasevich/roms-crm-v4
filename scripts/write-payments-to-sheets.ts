import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import path from "path";
import fs from "fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

async function main() {
  // Auth with Google
  const credsPath = path.join("C:", "Users", "matyc", "projects", "roms-crm", "webapp", "credentials.json");
  const auth = new google.auth.GoogleAuth({
    keyFile: credsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Get all pagado payments
  const { data: payments } = await sb
    .from("payments")
    .select("monto_usd, fecha_pago, receptor, metodo_pago, lead_id")
    .eq("estado", "pagado");

  // Get leads with sheets_row_index
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, ticket_total, sheets_row_index")
    .not("sheets_row_index", "is", null);

  if (!payments || !leads) {
    console.log("No data");
    return;
  }

  const leadMap: Record<string, (typeof leads)[0]> = {};
  for (const l of leads) leadMap[l.id] = l;

  const processedRows = new Set<number>();
  const updates: { range: string; values: (string | number)[][] }[] = [];

  for (const p of payments) {
    if (!p.lead_id) continue;
    const lead = leadMap[p.lead_id];
    if (!lead) continue;
    if (lead.estado !== "cerrado" && lead.estado !== "adentro_seguimiento") continue;
    if (!lead.sheets_row_index) continue;
    if (processedRows.has(lead.sheets_row_index)) continue;
    processedRows.add(lead.sheets_row_index);

    const leadPayments = payments.filter((pp) => pp.lead_id === p.lead_id);
    const p1 = leadPayments[0];
    const p2 = leadPayments[1];
    const p3 = leadPayments[2];
    const totalCash = leadPayments.reduce((s, pp) => s + pp.monto_usd, 0);
    const row = lead.sheets_row_index;
    const sheet = "'📞 Registro Calls'";

    // REAL column mapping from screenshot:
    // A=Nombre, B=Instagram, ... M=Cash Día 1, N=Cash Total, O=Ticket Total
    // P=Plan de Pago, Q=Pago 1, R=Estado Pago 1, S=Fecha Pago 1
    // T=Pago 2, U=Estado Pago 2, V=Pago 3, W=Estado Pago 3
    // X=Saldo Pendiente, Y=Método Pago
    // AS=Quién recibe (col 45)

    // Cash Día 1 (M)
    updates.push({ range: `${sheet}!M${row}`, values: [[p1 ? p1.monto_usd : ""]] });
    // Cash Total (N)
    updates.push({ range: `${sheet}!N${row}`, values: [[totalCash]] });
    // Ticket Total (O)
    updates.push({ range: `${sheet}!O${row}`, values: [[lead.ticket_total || totalCash]] });
    // Pago 1 (Q), Estado P1 (R), Fecha Pago 1 (S)
    updates.push({ range: `${sheet}!Q${row}`, values: [[p1 ? p1.monto_usd : ""]] });
    updates.push({ range: `${sheet}!R${row}`, values: [[p1 ? "Pagado" : ""]] });
    updates.push({ range: `${sheet}!S${row}`, values: [[p1?.fecha_pago?.split("T")[0] || ""]] });
    // Pago 2 (T), Estado P2 (U)
    updates.push({ range: `${sheet}!T${row}`, values: [[p2 ? p2.monto_usd : ""]] });
    updates.push({ range: `${sheet}!U${row}`, values: [[p2 ? "Pagado" : ""]] });
    // Pago 3 (V), Estado P3 (W)
    updates.push({ range: `${sheet}!V${row}`, values: [[p3 ? p3.monto_usd : ""]] });
    updates.push({ range: `${sheet}!W${row}`, values: [[p3 ? "Pagado" : ""]] });
    // Método Pago (Y)
    const metodo = p1?.metodo_pago ? p1.metodo_pago.charAt(0).toUpperCase() + p1.metodo_pago.slice(1) : "";
    updates.push({ range: `${sheet}!Y${row}`, values: [[metodo]] });
    // Quién recibe (AS)
    updates.push({ range: `${sheet}!AS${row}`, values: [[p1?.receptor || ""]] });
  }

  console.log(`Rows to update: ${processedRows.size}`);
  console.log(`Total cell updates: ${updates.length}`);

  if (updates.length === 0) {
    console.log("Nothing to update");
    return;
  }

  // Batch update with USER_ENTERED (100 at a time)
  const BATCH = 100;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: batch,
      },
    });
    console.log(`  Updated ${Math.min(i + BATCH, updates.length)} / ${updates.length} cells`);
  }

  console.log(`\nDone! Updated ${processedRows.size} rows in Sheets.`);
}

main().catch(console.error);
