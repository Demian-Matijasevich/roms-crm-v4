import { config } from "dotenv";
config({ path: ".env.local" });

const N8N_URL = "https://n8n.backstagge.com";
const N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NWViMGZhNS1hYmJlLTRkZWUtOTI0Ni1kYmQ2ZTMxNzAxMTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzc0NzRkNmQtNTMwZC00MmYyLTk4MTAtNGUyMGI1ZmU1OGQyIiwiaWF0IjoxNzc1NTAxMTY5fQ.A7a6QH3-4P0-s3uPyykkxcdXN2p3FEtpfYVMAb9DCQM";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const syncCode = `
const SB_URL = "${SB_URL}";
const SB_KEY = "${SB_KEY}";
const sbHeaders = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

async function sbGet(path) {
  return await this.helpers.httpRequest({ method: "GET", url: SB_URL + path, headers: sbHeaders });
}

async function sbPost(path, body) {
  return await this.helpers.httpRequest({ method: "POST", url: SB_URL + path, headers: { ...sbHeaders, Prefer: "return=representation,resolution=merge-duplicates" }, body });
}

// Fetch existing gastos by sheets_row_index
const existing = await sbGet.call(this, "/rest/v1/gastos?select=id,sheets_row_index&sheets_row_index=not.is.null");
const existingMap = {};
for (const e of existing) existingMap[e.sheets_row_index] = e.id;

const rows = $input.all();
let created = 0, updated = 0, errors = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i].json;
  const rowIdx = parseInt(r["row_number"]) || (i + 2);

  // Columns from Sheets: Fecha, Concepto, Monto, Categoria, Billetera, Pagado A, Estado
  const fecha = r["Fecha"] || null;
  const concepto = r["Concepto"] || null;
  if (!concepto) continue;

  const montoRaw = String(r["Monto"] || r["Monto USD"] || "0").replace(/[^0-9.,\\-]/g, "").replace(",", ".");
  const monto = parseFloat(montoRaw) || 0;

  const gasto = {
    sheets_row_index: rowIdx,
    fecha: fecha || null,
    concepto,
    monto_usd: monto,
    categoria: r["Categoria"] || r["Categoría"] || null,
    billetera: r["Billetera"] || null,
    pagado_a: r["Pagado A"] || r["Pagado a"] || null,
    estado: (r["Estado"] || "pendiente").toLowerCase().includes("pagado") ? "pagado" : "pendiente",
  };

  try {
    if (existingMap[rowIdx]) {
      await this.helpers.httpRequest({
        method: "PATCH",
        url: SB_URL + "/rest/v1/gastos?id=eq." + existingMap[rowIdx],
        headers: sbHeaders,
        body: gasto
      });
      updated++;
    } else {
      const data = await this.helpers.httpRequest({
        method: "POST",
        url: SB_URL + "/rest/v1/gastos",
        headers: { ...sbHeaders, Prefer: "return=representation" },
        body: gasto
      });
      if (data && data[0]) existingMap[rowIdx] = data[0].id;
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
        parameters: {
          rule: { interval: [{ field: "minutes", minutesInterval: 30 }] }
        },
        id: "trigger",
        name: "Every 30 Minutes",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [240, 300]
      },
      {
        parameters: {
          operation: "read",
          documentId: { __rl: true, value: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4", mode: "id" },
          sheetName: { __rl: true, value: "💸 Gastos", mode: "name" },
          options: {},
          authentication: "serviceAccount"
        },
        id: "read-gastos",
        name: "Read Gastos Sheet",
        type: "n8n-nodes-base.googleSheets",
        typeVersion: 4.5,
        position: [460, 300],
        credentials: { googleApi: { id: "oAZmFqwzsE3MKCaK", name: "Google Sheets - ROMS CRM" } }
      },
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: syncCode
        },
        id: "sync-gastos",
        name: "Sync Gastos to Supabase",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [680, 300]
      }
    ],
    connections: {
      "Every 30 Minutes": { main: [[ { node: "Read Gastos Sheet", type: "main", index: 0 } ]] },
      "Read Gastos Sheet": { main: [[ { node: "Sync Gastos to Supabase", type: "main", index: 0 } ]] }
    },
    settings: { executionOrder: "v1" }
  };

  // Create new workflow
  const res = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: "POST",
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(workflow)
  });

  const data = await res.json();
  console.log(`Created: ${data.name} | ID: ${data.id}`);

  // Activate it
  if (data.id) {
    const activateRes = await fetch(`${N8N_URL}/api/v1/workflows/${data.id}/activate`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" }
    });
    const activateData = await activateRes.json();
    console.log(`Active: ${activateData.active}`);
  }
}

main().catch(console.error);
