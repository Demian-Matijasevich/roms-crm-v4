import { config } from "dotenv";
config({ path: ".env.local" });

const N8N_URL = "https://n8n.backstagge.com";
const N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NWViMGZhNS1hYmJlLTRkZWUtOTI0Ni1kYmQ2ZTMxNzAxMTIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzc0NzRkNmQtNTMwZC00MmYyLTk4MTAtNGUyMGI1ZmU1OGQyIiwiaWF0IjoxNzc1NTAxMTY5fQ.A7a6QH3-4P0-s3uPyykkxcdXN2p3FEtpfYVMAb9DCQM";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKFLOW_ID = "QmELn92gEMllWWdF";

const syncCode = `
const SB_URL = "${SB_URL}";
const SB_KEY = "${SB_KEY}";
const sbHeaders = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

async function sbGet(path) {
  const res = await this.helpers.httpRequest({ method: "GET", url: SB_URL + path, headers: sbHeaders });
  return res;
}

async function sbPost(path, body) {
  return await this.helpers.httpRequest({ method: "POST", url: SB_URL + path, headers: { ...sbHeaders, Prefer: "return=representation" }, body });
}

async function sbPatch(path, body) {
  return await this.helpers.httpRequest({ method: "PATCH", url: SB_URL + path, headers: sbHeaders, body });
}

// Get team members + aliases
const teamArr = await sbGet.call(this, "/rest/v1/team_members?select=id,nombre&activo=eq.true");
const teamMap = {};
for (const t of teamArr) if (t.nombre) teamMap[t.nombre.toLowerCase()] = t.id;
// Add aliases for accent-less matching
teamMap["valen"] = teamMap["valentino"] || null;
teamMap["agustin"] = teamMap["agustín"] || null;
teamMap["juan martin"] = teamMap["juan martín"] || null;
teamMap["agustín"] = teamMap["agustín"] || null;
teamMap["juan martín"] = teamMap["juan martín"] || null;

function findTeamFuzzy(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (teamMap[n]) return teamMap[n];
  // Try removing accents
  const noAccent = n.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  if (teamMap[noAccent]) return teamMap[noAccent];
  // Try partial match
  for (const [key, id] of Object.entries(teamMap)) {
    if (key && id && (key.includes(n) || n.includes(key))) return id;
  }
  return null;
}

// Map exact Sheets estado strings to our enum
function mapEstado(raw) {
  if (!raw) return "pendiente";
  const s = raw.trim();
  if (s.includes("Cerrado")) return "cerrado";
  if (s.includes("No Cierre")) return "no_cierre";
  if (s.includes("Cancelada")) return "cancelada";
  if (s.includes("Reserva")) return "reserva";
  if (s.includes("No-Show") || s.includes("No Show")) return "no_show";
  if (s.includes("No Calificado")) return "no_calificado";
  if (s.includes("Re-programada") || s.includes("Reprogramada")) return "reprogramada";
  if (s.includes("Adentro en Seguimiento")) return "adentro_seguimiento";
  if (s.includes("seguimiento") || s.includes("Seguimiento")) return "seguimiento";
  if (s.includes("No agend")) return "cancelada";
  if (s.includes("Pendiente")) return "pendiente";
  return "pendiente";
}

function mapPrograma(raw) {
  if (!raw) return null;
  const l = raw.toLowerCase();
  if (l.includes("multicuentas")) return "multicuentas";
  if (l.includes("omnipresencia")) return "omnipresencia";
  if (l.includes("consultor")) return "consultoria";
  if (l.includes("roms")) return "roms_7";
  return null;
}

function findTeam(name) {
  if (!name) return null;
  return teamMap[name.toLowerCase()] || null;
}

// Normalize receptor names to canonical form
function normalizeReceptor(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const map = {
    juanma: "JUANMA", "juanma wise": "JUANMA", juanbma: "JUANMA",
    fran: "FRAN", valen: "VALEN", manual: "Manual"
  };
  return map[s] || raw.trim();
}

// Fetch existing leads
const existing = await sbGet.call(this, "/rest/v1/leads?select=id,sheets_row_index&sheets_row_index=not.is.null");
const existingMap = {};
for (const e of existing) existingMap[e.sheets_row_index] = e.id;

const rows = $input.all();
let created = 0, updated = 0, errors = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i].json;
  const rowIdx = parseInt(r["row_number"]) || (i + 2);
  const nombre = r["Nombre"] || r["nombre"] || null;
  if (!nombre || typeof nombre !== "string" || nombre.length < 2) continue;

  const ticketTotal = parseFloat(r["Ticket Total"] || r["TicketTotal"] || "0") || 0;
  const cashDia1 = parseFloat(r["Cash Día 1"] || r["Cash Dia 1"] || "0") || 0;
  const cashTotal = parseFloat(r["Cash Total"] || "0") || 0;
  const pago1 = parseFloat(r["Pago 1"] || "0") || 0;
  const pago2 = parseFloat(r["Pago 2"] || "0") || 0;
  const pago3 = parseFloat(r["Pago 3"] || "0") || 0;

  const lead = {
    sheets_row_index: rowIdx,
    nombre,
    instagram: r["Instagram"] || null,
    email: r["Email"] || null,
    telefono: r["Teléfono"] || r["Telefono"] || null,
    fecha_llamada: r["Fecha Llamada"] || null,
    fecha_agendado: r["Fecha Agenda"] || null,
    estado: mapEstado(r["Estado"] || ""),
    setter_id: findTeamFuzzy(r["Setter"]),
    closer_id: findTeamFuzzy(r["Closer"]),
    programa_pitcheado: mapPrograma(r["Programa"]),
    ticket_total: ticketTotal || cashTotal || cashDia1 || pago1,
    plan_pago: (r["Plan de Pago"] || "").toLowerCase().includes("full") ? "paid_in_full" : (r["Plan de Pago"] || "").includes("2") ? "2_cuotas" : (r["Plan de Pago"] || "").includes("3") ? "3_cuotas" : null,
    contexto_setter: r["Contexto Setter"] || null,
    reporte_general: r["Reporte General"] || r["Contexto Closer"] || null,
    notas_internas: r["Notas internas"] || null,
    fuente: (r["Fuente"] || "").toLowerCase().includes("instagram") ? "instagram" : (r["Fuente"] || "").toLowerCase().includes("whatsapp") ? "whatsapp" : (r["Fuente"] || "").toLowerCase().includes("manual") ? "otro" : "otro",
    link_llamada: r["Link de llamada"] || null,
    de_donde_viene_lead: r["De dónde viene el lead"] || null,
  };

  // First: upsert the lead
  let leadId = existingMap[rowIdx];
  try {
    if (leadId) {
      await sbPatch.call(this, "/rest/v1/leads?id=eq." + leadId, lead);
      updated++;
    } else {
      const data = await sbPost.call(this, "/rest/v1/leads", lead);
      if (data && data[0] && data[0].id) {
        leadId = data[0].id;
        existingMap[rowIdx] = leadId;
      }
      created++;
    }
  } catch(e) { errors++; continue; }

  // Read "Quién Recibe" column and normalize receptor
  const quienRecibe = normalizeReceptor(r["Quién Recibe"] || r["Quién recibe"] || r["Quien Recibe"] || r["quien recibe"] || null);

  // Sync payments using DEDUP (never delete existing payments)
  if (leadId && (pago1 > 0 || pago2 > 0 || pago3 > 0 || cashDia1 > 0 || cashTotal > 0)) {
    // Get existing payments for this lead to avoid duplicates
    let existingPays = [];
    try {
      existingPays = await sbGet.call(this, "/rest/v1/payments?lead_id=eq." + leadId + "&select=id,monto_usd,numero_cuota,fecha_pago,receptor");
    } catch(e) {}

    // Build dedup set: lead_id|rounded_monto|fecha
    const existSet = new Set();
    for (const ep of existingPays) {
      existSet.add(Math.round(ep.monto_usd) + "|" + (ep.fecha_pago || "nodate"));
    }

    // Preserve existing receptor if Sheets has none
    let existingReceptor = null;
    for (const ep of existingPays) {
      if (ep.receptor) { existingReceptor = normalizeReceptor(ep.receptor); break; }
    }
    const finalReceptor = quienRecibe || existingReceptor || null;

    const ep1 = (r["Estado Pago 1"] || "").toLowerCase();
    const ep2 = (r["Estado Pago 2"] || "").toLowerCase();
    const ep3 = (r["Estado Pago 3"] || "").toLowerCase();
    const monto1 = pago1 > 0 ? pago1 : (cashDia1 > 0 ? cashDia1 : cashTotal);
    const payments = [];
    if (monto1 > 0) payments.push({ lead_id: leadId, numero_cuota: 1, monto_usd: monto1, estado: ep1.includes("pagado") ? "pagado" : ep1.includes("perdido") ? "perdido" : "pendiente", fecha_pago: r["Fecha Pago 1"] || r["Fecha Llamada"] || null, receptor: finalReceptor });
    if (pago2 > 0) payments.push({ lead_id: leadId, numero_cuota: 2, monto_usd: pago2, estado: ep2.includes("pagado") ? "pagado" : ep2.includes("perdido") ? "perdido" : "pendiente", fecha_pago: r["Fecha Pago 2"] || null, receptor: finalReceptor });
    if (pago3 > 0) payments.push({ lead_id: leadId, numero_cuota: 3, monto_usd: pago3, estado: ep3.includes("pagado") ? "pagado" : ep3.includes("perdido") ? "perdido" : "pendiente", fecha_pago: r["Fecha Pago 3"] || null, receptor: finalReceptor });
    for (const p of payments) {
      // Dedup: skip if same monto+fecha already exists for this lead
      const dedupKey = Math.round(p.monto_usd) + "|" + (p.fecha_pago || "nodate");
      if (existSet.has(dedupKey)) continue;
      try { await sbPost.call(this, "/rest/v1/payments", p); existSet.add(dedupKey); } catch(e) {}
    }
  }
}

return [{ json: { created, updated, errors, total: rows.length } }];
`;

async function main() {
  const workflow = {
    name: "ROMS: Sheets -> Supabase Sync",
    nodes: [
      {
        parameters: {
          rule: { interval: [{ field: "minutes", minutesInterval: 5 }] }
        },
        id: "trigger",
        name: "Every 5 Minutes",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [240, 300]
      },
      {
        parameters: {
          operation: "read",
          documentId: { __rl: true, value: "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4", mode: "id" },
          sheetName: { __rl: true, value: "📞 Registro Calls", mode: "name" },
          options: {},
          authentication: "serviceAccount"
        },
        id: "read-sheets",
        name: "Read Registro Calls",
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
        id: "sync-code",
        name: "Sync to Supabase",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [680, 300]
      }
    ],
    connections: {
      "Every 5 Minutes": { main: [[ { node: "Read Registro Calls", type: "main", index: 0 } ]] },
      "Read Registro Calls": { main: [[ { node: "Sync to Supabase", type: "main", index: 0 } ]] }
    },
    settings: { executionOrder: "v1" }
  };

  const res = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(workflow)
  });

  const data = await res.json();
  console.log(`Updated: ${data.name} | Active: ${data.active}`);
}

main().catch(console.error);
