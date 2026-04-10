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

// Get team members for closer/setter mapping
let teamArr = [];
try {
  teamArr = await this.helpers.httpRequest({ method: "GET", url: SB_URL + "/rest/v1/team_members?select=id,nombre&activo=eq.true", headers: sbHeaders });
} catch(e) {}
const teamMap = {};
for (const t of teamArr) if (t.nombre) {
  teamMap[t.nombre.toLowerCase()] = t.id;
  // Add accent-less aliases
  const noAccent = t.nombre.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  if (noAccent !== t.nombre.toLowerCase()) teamMap[noAccent] = t.id;
}
teamMap["valen"] = teamMap["valentino"] || null;

// Get existing leads for name matching (to link payments to leads)
let leadsArr = [];
try {
  leadsArr = await this.helpers.httpRequest({ method: "GET", url: SB_URL + "/rest/v1/leads?select=id,nombre,instagram&limit=2000", headers: sbHeaders });
} catch(e) {}
const leadsByName = {};
for (const l of leadsArr) {
  if (l.nombre) leadsByName[l.nombre.toLowerCase().trim()] = l.id;
}

// Get existing pagos-sheet payments to avoid duplicates
let existingPagos = [];
try {
  existingPagos = await this.helpers.httpRequest({ method: "GET", url: SB_URL + "/rest/v1/payments?select=id,sheets_pagos_row&sheets_pagos_row=not.is.null", headers: sbHeaders });
} catch(e) {}
const existingMap = {};
for (const p of existingPagos) if (p.sheets_pagos_row) existingMap[p.sheets_pagos_row] = p.id;

// Get ALL payments for monto+lead dedup (avoid duplicating FINANZAS imports)
let allPayments = [];
try {
  allPayments = await this.helpers.httpRequest({ method: "GET", url: SB_URL + "/rest/v1/payments?select=lead_id,monto_usd,fecha_pago", headers: sbHeaders });
} catch(e) {}
const dedupSet = new Set();
for (const p of allPayments) {
  if (p.lead_id && p.monto_usd) dedupSet.add(p.lead_id + "|" + Math.round(p.monto_usd) + "|" + (p.fecha_pago || "nodate"));
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Already ISO: 2026-03-23
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY or D/M/YYYY
  let m = s.match(/^(\\d{1,2})[\\/](\\d{1,2})[\\/](\\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  // DD-MM-YYYY
  m = s.match(/^(\\d{1,2})-(\\d{1,2})-(\\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  // MM-DD-YYYY (fallback)
  m = s.match(/^(\\d{2})-(\\d{2})-(\\d{4})$/);
  if (m) return m[3] + "-" + m[1] + "-" + m[2];
  return null;
}

const rows = $input.all();
let created = 0, updated = 0, skipped = 0, errors = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i].json;
  const rowIdx = parseInt(r["row_number"]) || (i + 2);

  const nombre = (r["Nombre del Cliente"] || r["Nombre"] || r["nombre"] || "").trim();
  const monto = parseFloat(String(r["Monto USD"] || r["Monto"] || r["Monto (USD)"] || "0").replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;

  if (!nombre || monto <= 0) { skipped++; continue; }

  // Find the lead by name
  let leadId = leadsByName[nombre.toLowerCase().trim()] || null;

  // Try partial match if exact not found
  if (!leadId) {
    const nameLower = nombre.toLowerCase();
    for (const [key, id] of Object.entries(leadsByName)) {
      if (key.includes(nameLower) || nameLower.includes(key)) {
        leadId = id;
        break;
      }
    }
  }

  const fecha = r["Fecha"] || null;
  const closer = r["Closer"] || null;
  const setter = r["Setter"] || null;
  const receptor = r["Receptor"] || r["Quién Recibe"] || r["Quien Recibe"] || null;
  const concepto = r["Concepto"] || null;
  const producto = r["Programa"] || r["Producto"] || null;
  const fuente = r["Fuente"] || null;
  const telefono = r["Teléfono"] || r["Telefono"] || null;

  function findTeam(name) {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return teamMap[n] || teamMap[n.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")] || null;
  }

  const payment = {
    sheets_pagos_row: rowIdx,
    lead_id: leadId,
    numero_cuota: 1,
    monto_usd: monto,
    estado: "pagado",
    fecha_pago: parseDate(fecha),
    receptor: receptor,
    cobrador_id: null,
    metodo_pago: null,
  };

  try {
    if (existingMap[rowIdx]) {
      await this.helpers.httpRequest({ method: "PATCH", url: SB_URL + "/rest/v1/payments?id=eq." + existingMap[rowIdx], headers: sbHeaders, body: payment });
      updated++;
    } else {
      // Check monto+lead dedup before creating (avoid duplicating FINANZAS imports)
      const dk = (leadId || "nolead") + "|" + Math.round(monto) + "|" + (payment.fecha_pago || "nodate");
      if (dedupSet.has(dk)) { skipped++; continue; }
      await this.helpers.httpRequest({ method: "POST", url: SB_URL + "/rest/v1/payments", headers: { ...sbHeaders, Prefer: "return=representation" }, body: payment });
      dedupSet.add(dk);
      created++;
    }
  } catch(e) { errors++; }
}

return [{ json: { created, updated, skipped, errors, total: rows.length } }];
`;

async function main() {
  // First add sheets_pagos_row column to payments if not exists
  console.log("Adding sheets_pagos_row column...");
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "ALTER TABLE payments ADD COLUMN IF NOT EXISTS sheets_pagos_row int" }),
    });
  } catch (e) {
    console.log("Column might already exist or needs SQL editor");
  }

  const workflow = {
    name: "ROMS: Pagos Sheet Sync",
    nodes: [
      {
        parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } },
        id: "trigger",
        name: "Every 5 Minutes",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [240, 300],
      },
      {
        parameters: {
          operation: "read",
          documentId: { __rl: true, value: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4", mode: "id" },
          sheetName: { __rl: true, value: "💳 Registro de Pagos", mode: "name" },
          options: {},
          authentication: "serviceAccount",
        },
        id: "read-pagos",
        name: "Read Pagos Sheet",
        type: "n8n-nodes-base.googleSheets",
        typeVersion: 4.5,
        position: [460, 300],
        credentials: { googleApi: { id: "oAZmFqwzsE3MKCaK", name: "Google Sheets - ROMS CRM" } },
      },
      {
        parameters: { mode: "runOnceForAllItems", jsCode: syncCode },
        id: "sync-code",
        name: "Sync Pagos to Supabase",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [680, 300],
      },
    ],
    connections: {
      "Every 5 Minutes": { main: [[{ node: "Read Pagos Sheet", type: "main", index: 0 }]] },
      "Read Pagos Sheet": { main: [[{ node: "Sync Pagos to Supabase", type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1" },
  };

  const res = await fetch(`${N8N_URL}/api/v1/workflows/sBRCqD05Spt7xAAZ`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });

  const data = await res.json();
  console.log(`Created: ${data.name} | ID: ${data.id} | Active: ${data.active}`);
}

main().catch(console.error);
