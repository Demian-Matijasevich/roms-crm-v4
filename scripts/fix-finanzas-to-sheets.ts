import { config } from "dotenv";
config({ path: ".env.local" });

const N8N_URL = "https://n8n.backstagge.com";
const N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NWViMGZhNS1hYmJlLTRkZWUtOTI0Ni1kYmQ2ZTMxNzAxMTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzc0NzRkNmQtNTMwZC00MmYyLTk4MTAtNGUyMGI1ZmU1OGQyIiwiaWF0IjoxNzc1NTAxMTY5fQ.A7a6QH3-4P0-s3uPyykkxcdXN2p3FEtpfYVMAb9DCQM";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKFLOW_ID = "tnOaI3plZ8WTCPRv";

// The Code node fetches payments from Supabase, then uses appendOrUpdate to write to Sheets
// But we'll do it all in one Code node that outputs items matching the Sheet column names

const fetchCode = `
const SB_URL = "${SB_URL}";
const SB_KEY = "${SB_KEY}";
const sbHeaders = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

// Get all pagado payments with lead info
const payments = await this.helpers.httpRequest({
  method: "GET",
  url: SB_URL + "/rest/v1/payments?estado=eq.pagado&select=monto_usd,fecha_pago,receptor,metodo_pago,lead_id",
  headers: sbHeaders
});

// Get all leads with sheets_row_index
const leads = await this.helpers.httpRequest({
  method: "GET",
  url: SB_URL + "/rest/v1/leads?select=id,nombre,estado,ticket_total,sheets_row_index&sheets_row_index=not.is.null",
  headers: sbHeaders
});

const leadMap = {};
for (const l of leads) leadMap[l.id] = l;

// Only process payments for cerrado/adentro_seguimiento leads
const items = [];
const processedRows = new Set();

for (const p of payments) {
  if (!p.lead_id) continue;
  const lead = leadMap[p.lead_id];
  if (!lead) continue;
  if (lead.estado !== "cerrado" && lead.estado !== "adentro_seguimiento") continue;
  if (!lead.sheets_row_index) continue;
  if (processedRows.has(lead.sheets_row_index)) continue; // one update per row
  processedRows.add(lead.sheets_row_index);

  // Get all payments for this lead
  const leadPayments = payments.filter(pp => pp.lead_id === p.lead_id).sort((a,b) => (a.fecha_pago||"").localeCompare(b.fecha_pago||""));

  const p1 = leadPayments[0];
  const p2 = leadPayments[1];
  const p3 = leadPayments[2];

  items.push({
    json: {
      row_number: lead.sheets_row_index,
      "Nombre": lead.nombre,
      "Cash Día 1": p1 ? p1.monto_usd : "",
      "Cash Total": leadPayments.reduce((s,pp) => s + pp.monto_usd, 0),
      "Ticket Total": lead.ticket_total || leadPayments.reduce((s,pp) => s + pp.monto_usd, 0),
      "Pago 1": p1 ? p1.monto_usd : "",
      "Estado Pago 1": p1 ? "Pagado" : "",
      "Fecha Pago 1": p1 && p1.fecha_pago ? p1.fecha_pago.split("T")[0] : "",
      "Pago 2": p2 ? p2.monto_usd : "",
      "Estado Pago 2": p2 ? "Pagado" : "Pendiente",
      "Pago 3": p3 ? p3.monto_usd : "",
      "Estado Pago 3": p3 ? "Pagado" : "Pendiente",
      "Método Pago": p1 && p1.metodo_pago ? p1.metodo_pago.charAt(0).toUpperCase() + p1.metodo_pago.slice(1) : "",
      "Quién Recibe": p1 ? (p1.receptor || "") : "",
    }
  });
}

return items;
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
          jsCode: fetchCode,
        },
        id: "fetch",
        name: "Fetch Payments from Supabase",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [460, 300],
      },
      {
        parameters: {
          operation: "appendOrUpdate",
          documentId: {
            __rl: true,
            value: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4",
            mode: "id",
          },
          sheetName: {
            __rl: true,
            value: "📞 Registro Calls",
            mode: "name",
          },
          columns: {
            mappingMode: "defineBelow",
            value: {
              "Nombre": "={{ $json[\"Nombre\"] }}",
              "Cash Día 1": "={{ $json[\"Cash Día 1\"] }}",
              "Cash Total": "={{ $json[\"Cash Total\"] }}",
              "Ticket Total": "={{ $json[\"Ticket Total\"] }}",
              "Pago 1": "={{ $json[\"Pago 1\"] }}",
              "Estado Pago 1": "={{ $json[\"Estado Pago 1\"] }}",
              "Fecha Pago 1": "={{ $json[\"Fecha Pago 1\"] }}",
              "Pago 2": "={{ $json[\"Pago 2\"] }}",
              "Estado Pago 2": "={{ $json[\"Estado Pago 2\"] }}",
              "Pago 3": "={{ $json[\"Pago 3\"] }}",
              "Estado Pago 3": "={{ $json[\"Estado Pago 3\"] }}",
              "Método Pago": "={{ $json[\"Método Pago\"] }}",
              "Quién Recibe": "={{ $json[\"Quién Recibe\"] }}",
            },
            matchingColumns: ["Nombre"],
          },
          options: {},
          authentication: "serviceAccount",
        },
        id: "update-sheets",
        name: "Update Registro Calls",
        type: "n8n-nodes-base.googleSheets",
        typeVersion: 4.5,
        position: [680, 300],
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
        main: [[{ node: "Fetch Payments from Supabase", type: "main", index: 0 }]],
      },
      "Fetch Payments from Supabase": {
        main: [[{ node: "Update Registro Calls", type: "main", index: 0 }]],
      },
    },
    settings: { executionOrder: "v1" },
  };

  const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: "PUT",
    headers: {
      "X-N8N-API-KEY": N8N_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workflow),
  });

  const data = await res.json();
  console.log(`Updated: ${data.name} | Active: ${data.active}`);
}

main().catch(console.error);
