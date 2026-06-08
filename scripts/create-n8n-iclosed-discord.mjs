/**
 * Crea workflow n8n: iClosed → Discord (general + landing).
 *
 * Flujo:
 *   1) Webhook POST en /webhook/iclosed-discord
 *   2) Code: parsea payload, arma mensaje, decide si tiene UTM
 *   3) HTTP Request: Discord webhook "agendas-generales" — siempre
 *   4) IF: hasUtm === false
 *   5) HTTP Request: Discord webhook "landing" — solo si NO tiene UTM
 */
const N8N = "https://n8n.backstagge.com/api/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMTIxNTU3Ny00M2RiLTQxYjYtYjRhOC00NjE3NjYyMzIyYjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMWNlMGU4ZTYtMTQ5MC00ZTExLWJkZTYtYzYyYTU1MjliOTExIiwiaWF0IjoxNzc5NjU1NTQ1fQ.uILqJ5fGAAFg6LYS5G5FcqCgUTLa2mCUtDWqYG5kE-o";

const DISCORD_GENERAL = "https://discord.com/api/webhooks/1512871527941410946/IE_Q3gLkMwk9gB_vJKWOaYUL83epiG-n3o0H-ZiVVoNGaAi1DC6L5D4oEFyT0v_EwZZ5";
const DISCORD_LANDING = "https://discord.com/api/webhooks/1512871989457719317/EqS3cXyFQfkMQ6r0Ya9Gr0l-Tk2s1c46ovCOYXWo0hCbSAOb43mBZfnkL9kIPcZtcsGf";

const codeBuildMessage = `
// Parsea payload de iClosed y arma el mensaje para Discord.
const data = $input.first().json;
const body = data.body || data;

const eventName = body.event?.name || body.event?.eventType || "—";
const fechaIso = body.latestCall?.dateTime || body.createdAt || null;
let fecha = "—";
if (fechaIso) {
  const d = new Date(fechaIso);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    fecha = \`\${dd}/\${mm}/\${yyyy}\`;
  }
}

const closerNombre = [body.latestCall?.user?.firstName, body.latestCall?.user?.lastName].filter(Boolean).join(" ") || "—";
const setterNombre = body.setter?.name || "";

const cliNombre = [body.firstName, body.lastName].filter(Boolean).join(" ") || "—";
const cliTel = body.phoneNumber || "";
const qa = body.questionsAndAnswers || {};

// Construir respuestas del cliente (en orden)
let respuestas = "";
for (const [k, v] of Object.entries(qa)) {
  if (k.endsWith("_question") || k.endsWith("_response")) continue;
  if (!v) continue;
  respuestas += String(v).trim() + "\\n\\n";
}

const lines = [
  \`📅 **Nueva Agenda: \${eventName}**\`,
  "",
  \`**Tipo:** \${eventName}\`,
  \`**Fecha:** \${fecha}\`,
  \`**Closer:** \${closerNombre}\`,
  \`**Setter:** \${setterNombre}\`,
  "",
  "**Respuestas del cliente:**",
  cliNombre,
  cliTel,
  "",
  respuestas.trim(),
];

const content = lines.join("\\n");

// Decidir si tiene UTM (utm_source, utm_medium, utm_campaign con valor)
const t = body.tracking || {};
const hasUtm = !!(t.utm_source || t.utm_medium || t.utm_campaign);

return [{ json: { content, hasUtm } }];
`;

const workflow = {
  name: "iClosed → Discord (general + landing)",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "iclosed-discord",
        responseMode: "lastNode",
        options: {},
      },
      id: "wh-iclosed",
      name: "Webhook iClosed",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [240, 300],
      webhookId: "iclosed-discord",
    },
    {
      parameters: { jsCode: codeBuildMessage },
      id: "code-msg",
      name: "Armar Mensaje",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [460, 300],
    },
    {
      parameters: {
        method: "POST",
        url: DISCORD_GENERAL,
        sendBody: true,
        specifyBody: "json",
        jsonBody: '={\n  "content": {{ JSON.stringify($json.content) }}\n}',
        options: {},
      },
      id: "http-discord-general",
      name: "Discord Generales (siempre)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [680, 200],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
          conditions: [
            {
              id: "no-utm",
              leftValue: "={{ $json.hasUtm }}",
              rightValue: false,
              operator: { type: "boolean", operation: "equals" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: "if-no-utm",
      name: "Sin UTM?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [680, 400],
    },
    {
      parameters: {
        method: "POST",
        url: DISCORD_LANDING,
        sendBody: true,
        specifyBody: "json",
        jsonBody: '={\n  "content": {{ JSON.stringify($json.content) }}\n}',
        options: {},
      },
      id: "http-discord-landing",
      name: "Discord Landing (si sin UTM)",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [900, 400],
    },
  ],
  connections: {
    "Webhook iClosed": {
      main: [[{ node: "Armar Mensaje", type: "main", index: 0 }]],
    },
    "Armar Mensaje": {
      main: [[
        { node: "Discord Generales (siempre)", type: "main", index: 0 },
        { node: "Sin UTM?", type: "main", index: 0 },
      ]],
    },
    "Sin UTM?": {
      main: [
        [{ node: "Discord Landing (si sin UTM)", type: "main", index: 0 }],
        [],
      ],
    },
  },
};

const res = await fetch(`${N8N}/workflows`, {
  method: "POST",
  headers: {
    "X-N8N-API-KEY": KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(workflow),
});

const json = await res.json();
if (!res.ok) {
  console.log("✗ ERROR creando workflow:");
  console.log(JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log(`✓ Workflow creado:`);
console.log(`  id:     ${json.id}`);
console.log(`  name:   ${json.name}`);
console.log(`  active: ${json.active}`);
console.log(`\nWebhook test URL: https://n8n.backstagge.com/webhook-test/iclosed-discord`);
console.log(`Webhook prod URL: https://n8n.backstagge.com/webhook/iclosed-discord`);
console.log(`\nProximos pasos:`);
console.log(`  1. Activar el workflow desde la UI (o hacer PATCH active=true)`);
console.log(`  2. Configurar el webhook de iClosed para que apunte a la URL de produccion`);
console.log(`  3. Probar con una agenda y ver si llega el mensaje a Discord`);
