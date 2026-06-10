/**
 * Crea workflow n8n con cron a las 23:50 (hora Brasil) que dispara el
 * endpoint /api/cron/eod-report del CRM. El endpoint manda el WA.
 */
const N8N = "https://n8n.backstagge.com/api/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMTIxNTU3Ny00M2RiLTQxYjYtYjRhOC00NjE3NjYyMzIyYjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMWNlMGU4ZTYtMTQ5MC00ZTExLWJkZTYtYzYyYTU1MjliOTExIiwiaWF0IjoxNzc5NjU1NTQ1fQ.uILqJ5fGAAFg6LYS5G5FcqCgUTLa2mCUtDWqYG5kE-o";

const CRM_URL = "https://crm.backstagge.com";
const EOD_TOKEN = "eod-roms-cron-A7k9m2P5q8r3xV6n4t1J";

const workflow = {
  name: "EOD ROMS — Reporte WhatsApp 23:50",
  settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" },
  nodes: [
    {
      parameters: {
        rule: {
          interval: [{ field: "cronExpression", expression: "50 23 * * *" }],
        },
      },
      id: "cron-23-50",
      name: "Todos los días 23:50",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [240, 300],
    },
    {
      parameters: {
        method: "GET",
        url: `${CRM_URL}/api/cron/eod-report?token=${EOD_TOKEN}`,
        options: {
          timeout: 60000,
          response: { response: { neverError: true } },
        },
      },
      id: "http-eod-report",
      name: "GET /api/cron/eod-report",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [460, 300],
    },
  ],
  connections: {
    "Todos los días 23:50": {
      main: [[{ node: "GET /api/cron/eod-report", type: "main", index: 0 }]],
    },
  },
};

const res = await fetch(`${N8N}/workflows`, {
  method: "POST",
  headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
  body: JSON.stringify(workflow),
});
const json = await res.json();
if (!res.ok) {
  console.log("✗ ERROR:", JSON.stringify(json, null, 2));
  process.exit(1);
}
console.log(`✓ Workflow creado id=${json.id} active=${json.active}`);

// Activarlo
const act = await fetch(`${N8N}/workflows/${json.id}/activate`, {
  method: "POST",
  headers: { "X-N8N-API-KEY": KEY },
});
console.log(`activate: ${act.ok ? "✓" : "✗"}`);

console.log(`\nWorkflow ID: ${json.id}`);
console.log(`Cron: cada día a las 23:50 (hora Brasil)`);
console.log(`Llama a: ${CRM_URL}/api/cron/eod-report?token=...`);
