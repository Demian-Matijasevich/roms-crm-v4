import { config } from "dotenv";
config({ path: ".env.local" });

const N8N_URL = "https://n8n.backstagge.com";
const N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NWViMGZhNS1hYmJlLTRkZWUtOTI0Ni1kYmQ2ZTMxNzAxMTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzc0NzRkNmQtNTMwZC00MmYyLTk4MTAtNGUyMGI1ZmU1OGQyIiwiaWF0IjoxNzc1NTAxMTY5fQ.A7a6QH3-4P0-s3uPyykkxcdXN2p3FEtpfYVMAb9DCQM";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKFLOW_ID = "tnOaI3plZ8WTCPRv";

// Single Code node that does EVERYTHING: read Supabase, write to Sheets via Google API
// Uses the n8n Google Sheets credential to get an auth token, then calls Sheets API directly
const allInOneCode = `
const SB_URL = "${SB_URL}";
const SB_KEY = "${SB_KEY}";
const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";
const sbHeaders = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

// Step 1: Get payments from Supabase
const payments = await this.helpers.httpRequest({
  method: "GET",
  url: SB_URL + "/rest/v1/payments?estado=eq.pagado&select=monto_usd,fecha_pago,receptor,metodo_pago,lead_id",
  headers: sbHeaders
});

// Step 2: Get leads with sheets_row_index
const leads = await this.helpers.httpRequest({
  method: "GET",
  url: SB_URL + "/rest/v1/leads?select=id,nombre,estado,ticket_total,sheets_row_index&sheets_row_index=not.is.null&range=0-4999",
  headers: sbHeaders
});

const leadMap = {};
for (const l of leads) leadMap[l.id] = l;

// Step 3: Build updates per row
// Columns in Registro Calls:
// N (14) = Cash Total, O (15) = Ticket Total, Q (17) = Pago 1, R (18) = Estado Pago 1
// S (19) = Pago 2, T (20) = Estado Pago 2, U (21) = Pago 3, V (22) = Estado Pago 3
// X (24) = Fecha Pago 1, Y (25) = Método Pago
// Column mapping (0-indexed): M=12(CashDia1), N=13(CashTotal), O=14(TicketTotal)
// P=15(PlanPago), Q=16(Pago1), R=17(EstadoP1), S=18(Pago2), T=19(EstadoP2)
// U=20(Pago3), V=21(EstadoP3), W=22(SaldoPendiente), X=23(FechaPago1), Y=24(MetodoPago)
// AX-ish columns at end for "Quién Recibe"

const processedRows = new Set();
const updates = [];

for (const p of payments) {
  if (!p.lead_id) continue;
  const lead = leadMap[p.lead_id];
  if (!lead) continue;
  if (lead.estado !== "cerrado" && lead.estado !== "adentro_seguimiento") continue;
  if (!lead.sheets_row_index) continue;
  if (processedRows.has(lead.sheets_row_index)) continue;
  processedRows.add(lead.sheets_row_index);

  const leadPayments = payments.filter(pp => pp.lead_id === p.lead_id);
  const p1 = leadPayments[0];
  const p2 = leadPayments[1];
  const p3 = leadPayments[2];
  const totalCash = leadPayments.reduce((s, pp) => s + pp.monto_usd, 0);
  const row = lead.sheets_row_index;

  // Update Cash Día 1 (col M = index 12)
  updates.push({ range: "'📞 Registro Calls'!M" + row, values: [[p1 ? p1.monto_usd : ""]] });
  // Cash Total (col N)
  updates.push({ range: "'📞 Registro Calls'!N" + row, values: [[totalCash]] });
  // Ticket Total (col O)
  updates.push({ range: "'📞 Registro Calls'!O" + row, values: [[lead.ticket_total || totalCash]] });
  // Pago 1 (col Q)
  updates.push({ range: "'📞 Registro Calls'!Q" + row, values: [[p1 ? p1.monto_usd : ""]] });
  // Estado Pago 1 (col R)
  updates.push({ range: "'📞 Registro Calls'!R" + row, values: [[p1 ? "Pagado" : ""]] });
  // Pago 2 (col S)
  updates.push({ range: "'📞 Registro Calls'!S" + row, values: [[p2 ? p2.monto_usd : ""]] });
  // Estado Pago 2 (col T)
  updates.push({ range: "'📞 Registro Calls'!T" + row, values: [[p2 ? "Pagado" : "Pendiente"]] });
  // Pago 3 (col U)
  updates.push({ range: "'📞 Registro Calls'!U" + row, values: [[p3 ? p3.monto_usd : ""]] });
  // Estado Pago 3 (col V)
  updates.push({ range: "'📞 Registro Calls'!V" + row, values: [[p3 ? "Pagado" : "Pendiente"]] });
  // Fecha Pago 1 (col X)
  updates.push({ range: "'📞 Registro Calls'!X" + row, values: [[p1 && p1.fecha_pago ? p1.fecha_pago.split("T")[0] : ""]] });
  // Método Pago (col Y)
  const metodo = p1 && p1.metodo_pago ? p1.metodo_pago.charAt(0).toUpperCase() + p1.metodo_pago.slice(1) : "";
  updates.push({ range: "'📞 Registro Calls'!Y" + row, values: [[metodo]] });
}

if (updates.length === 0) {
  return [{ json: { message: "No updates needed", rows: 0 } }];
}

// Step 4: Use Google Sheets credential to get auth token and batch update
// Get the credential data
const credentials = await this.getCredentials("googleApi");
const email = credentials.email;
const privateKey = credentials.privateKey;

// Build JWT for Google OAuth
function base64url(str) {
  return Buffer.from(str).toString("base64").replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}

const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const now = Math.floor(Date.now() / 1000);
const payload = base64url(JSON.stringify({
  iss: email,
  scope: "https://www.googleapis.com/auth/spreadsheets",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 3600
}));

const crypto = require("crypto");
const sign = crypto.createSign("RSA-SHA256");
sign.update(header + "." + payload);
const signature = sign.sign(privateKey, "base64").replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const jwt = header + "." + payload + "." + signature;

// Get access token
const tokenRes = await this.helpers.httpRequest({
  method: "POST",
  url: "https://oauth2.googleapis.com/token",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt
});
const accessToken = tokenRes.access_token;

// Batch update Sheets (max 100 ranges per request)
const BATCH = 100;
let updated = 0;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  await this.helpers.httpRequest({
    method: "POST",
    url: "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID + "/values:batchUpdate",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: { valueInputOption: "RAW", data: batch }
  });
  updated += batch.length;
}

return [{ json: { message: "Done", rows: processedRows.size, cellsUpdated: updated } }];
`;

async function main() {
  const workflow = {
    name: "ROMS: Finanzas -> Sheets Sync",
    nodes: [
      {
        parameters: {},
        id: "trigger",
        name: "Run Once",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [240, 300],
      },
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: allInOneCode,
        },
        id: "sync",
        name: "Sync to Sheets",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [460, 300],
        credentials: {
          googleApi: {
            id: "oAZmFqwzsE3MKCaK",
            name: "Google Sheets - ROMS CRM",
          },
        },
      },
    ],
    connections: {
      "Run Once": {
        main: [[{ node: "Sync to Sheets", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };

  const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });

  const data = await res.json();
  console.log(`Updated: ${data.name} | Active: ${data.active}`);
}

main().catch(console.error);
