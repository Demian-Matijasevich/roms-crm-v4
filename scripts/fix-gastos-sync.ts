import { config } from "dotenv";
config({ path: ".env.local" });

const N8N_URL = "https://n8n.backstagge.com";
const N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NWViMGZhNS1hYmJlLTRkZWUtOTI0Ni1kYmQ2ZTMxNzAxMTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzc0NzRkNmQtNTMwZC00MmYyLTk4MTAtNGUyMGI1ZmU1OGQyIiwiaWF0IjoxNzc1NTAxMTY5fQ.A7a6QH3-4P0-s3uPyykkxcdXN2p3FEtpfYVMAb9DCQM";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKFLOW_ID = "KEKHMlw5NaQXBIeI";

const syncCode = `
const SB_URL = "${SB_URL}";
const SB_KEY = "${SB_KEY}";
const sbHeaders = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

const rows = $input.all();
let created = 0, updated = 0, errors = 0;

// Fetch existing gastos
let existing = [];
try {
  existing = await this.helpers.httpRequest({ method: "GET", url: SB_URL + "/rest/v1/gastos?select=id,sheets_row_index&sheets_row_index=not.is.null", headers: sbHeaders });
} catch(e) {}
const existingMap = {};
for (const e of existing) if (e.sheets_row_index) existingMap[e.sheets_row_index] = e.id;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i].json;
  const rowIdx = parseInt(r["row_number"]) || (i + 2);

  const concepto = r["Concepto"] || null;
  if (!concepto) continue;

  // Column is "Monto (USD)" in Sheets
  const montoRaw = String(r["Monto (USD)"] || r["Monto"] || r["Monto USD"] || "0").replace(/[^0-9.,-]/g, "").replace(",", ".");
  const monto = parseFloat(montoRaw) || 0;

  const gasto = {
    sheets_row_index: rowIdx,
    fecha: r["Fecha"] || null,
    concepto,
    monto_usd: monto,
    categoria: r["Categoría"] || r["Categoria"] || null,
    billetera: r["Billetera"] || null,
    pagado_a: r["Pagado a"] || r["Pagado A"] || null,
    pagado_por: r["Pagado por"] || null,
    estado: (r["Estado"] || "pagado").toLowerCase().includes("pagado") ? "pagado" : "pendiente",
  };

  try {
    if (existingMap[rowIdx]) {
      await this.helpers.httpRequest({ method: "PATCH", url: SB_URL + "/rest/v1/gastos?id=eq." + existingMap[rowIdx], headers: sbHeaders, body: gasto });
      updated++;
    } else {
      await this.helpers.httpRequest({ method: "POST", url: SB_URL + "/rest/v1/gastos", headers: { ...sbHeaders, Prefer: "return=representation" }, body: gasto });
      created++;
    }
  } catch(e) { errors++; }
}

return [{ json: { created, updated, errors, total: rows.length } }];
`;

async function main() {
  const workflow = {
    name: "ROMS: Gastos Sync",
    nodes: [
      {
        parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 30 }] } },
        id: "trigger",
        name: "Every 30 Minutes",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [240, 300],
      },
      {
        parameters: {
          operation: "read",
          documentId: { __rl: true, value: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4", mode: "id" },
          sheetName: { __rl: true, value: "💸 Gastos", mode: "name" },
          options: {},
          authentication: "serviceAccount",
        },
        id: "read-gastos",
        name: "Read Gastos Sheet",
        type: "n8n-nodes-base.googleSheets",
        typeVersion: 4.5,
        position: [460, 300],
        credentials: { googleApi: { id: "oAZmFqwzsE3MKCaK", name: "Google Sheets - ROMS CRM" } },
      },
      {
        parameters: { mode: "runOnceForAllItems", jsCode: syncCode },
        id: "sync-code",
        name: "Sync Gastos to Supabase",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [680, 300],
      },
    ],
    connections: {
      "Every 30 Minutes": { main: [[{ node: "Read Gastos Sheet", type: "main", index: 0 }]] },
      "Read Gastos Sheet": { main: [[{ node: "Sync Gastos to Supabase", type: "main", index: 0 }]] },
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
