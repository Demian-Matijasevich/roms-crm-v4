/**
 * Actualiza el workflow iClosed → Discord para incluir lookup del setter
 * via UTM → utm_campaigns de Supabase (igual lógica que el CRM).
 *
 * Cambios:
 *   - El Code node ahora hace fetch a Supabase con la utm (medium+content)
 *     y resuelve el nombre del setter via $helpers.httpRequest.
 *   - Si no hay match → setter queda vacío como antes.
 */
const N8N = "https://n8n.backstagge.com/api/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMTIxNTU3Ny00M2RiLTQxYjYtYjRhOC00NjE3NjYyMzIyYjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMWNlMGU4ZTYtMTQ5MC00ZTExLWJkZTYtYzYyYTU1MjliOTExIiwiaWF0IjoxNzc5NjU1NTQ1fQ.uILqJ5fGAAFg6LYS5G5FcqCgUTLa2mCUtDWqYG5kE-o";

const WORKFLOW_ID = "8qupAJMhX41MEGyS";

const SB_URL = "https://ureszjvnqgqozbedngxy.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZXN6anZucWdxb3piZWRuZ3h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczOTU4MiwiZXhwIjoyMDkxMzE1NTgyfQ.0JqXWTEWhO3kCdnDD16OKRXYhfCJLU1RAw_wSCWxoaA";

const DISCORD_GENERAL = "https://discord.com/api/webhooks/1512871527941410946/IE_Q3gLkMwk9gB_vJKWOaYUL83epiG-n3o0H-ZiVVoNGaAi1DC6L5D4oEFyT0v_EwZZ5";
const DISCORD_LANDING = "https://discord.com/api/webhooks/1512871989457719317/EqS3cXyFQfkMQ6r0Ya9Gr0l-Tk2s1c46ovCOYXWo0hCbSAOb43mBZfnkL9kIPcZtcsGf";

const codeBuildMessage = `
// Parsea payload de iClosed, resuelve el setter via Supabase (utm_campaigns)
// y arma el mensaje para Discord.
//
// FILTRO: iClosed manda muchos eventos por lead (created/qualified/etc.).
// Solo procesamos eventos de AGENDAMIENTO real, que es cuando:
//   - status incluye "BOOKED" (STRATEGY_CALL_BOOKED, DISCOVERY_CALL_BOOKED, etc.)
//   - O hookType es "contactByStatus" (booking confirmado)
// Si no es agenda real, devolvemos array vacío y no se manda nada a Discord.
const data = $input.first().json;
const body = data.body || data;

const status = String(body.status || "").toUpperCase();
const hookType = String(body.hookType || "").toLowerCase();
const isBooking = status.includes("BOOKED") || hookType === "contactbystatus";

if (!isBooking) {
  // Lead update que no es agenda — no notificamos
  return [];
}

const SB_URL = ${JSON.stringify(SB_URL)};
const SB_KEY = ${JSON.stringify(SB_KEY)};

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

const cliNombre = [body.firstName, body.lastName].filter(Boolean).join(" ") || "—";
const cliTel = body.phoneNumber || "";
const qa = body.questionsAndAnswers || {};

// Resolver setter via utm_campaigns (mismo criterio que el CRM)
const t = body.tracking || {};
const utmMedium = (t.utm_medium || "").trim();
const utmContent = (t.utm_content || "").trim();
const hasUtm = !!(t.utm_source || utmMedium || t.utm_campaign);

let setterNombre = "";
if (utmMedium) {
  try {
    // Match preferentemente por medium + content
    let url = \`\${SB_URL}/rest/v1/utm_campaigns?medium=ilike.\${encodeURIComponent(utmMedium)}\`;
    if (utmContent) url += \`&content=ilike.\${encodeURIComponent(utmContent)}\`;
    url += \`&setter_id=not.is.null&limit=1&select=setter_id,setter:team_members!utm_campaigns_setter_id_fkey(nombre)\`;

    const res = await this.helpers.httpRequest({
      method: "GET",
      url,
      headers: { apikey: SB_KEY, Authorization: \`Bearer \${SB_KEY}\`, Accept: "application/json" },
      json: true,
    });
    let resArr = typeof res === "string" ? JSON.parse(res) : res;
    if (Array.isArray(resArr) && resArr.length > 0) {
      setterNombre = resArr[0].setter?.nombre || "";
    }

    // Fallback: solo por medium (sin content)
    if (!setterNombre && utmContent) {
      const url2 = \`\${SB_URL}/rest/v1/utm_campaigns?medium=ilike.\${encodeURIComponent(utmMedium)}&setter_id=not.is.null&limit=1&select=setter_id,setter:team_members!utm_campaigns_setter_id_fkey(nombre)\`;
      const res2 = await this.helpers.httpRequest({
        method: "GET",
        url: url2,
        headers: { apikey: SB_KEY, Authorization: \`Bearer \${SB_KEY}\`, Accept: "application/json" },
        json: true,
      });
      let res2Arr = typeof res2 === "string" ? JSON.parse(res2) : res2;
      if (Array.isArray(res2Arr) && res2Arr.length > 0) {
        setterNombre = res2Arr[0].setter?.nombre || "";
      }
    }
  } catch (e) {
    // best-effort, dejar vacío si falla
    setterNombre = "";
  }
}

// Respuestas del cliente
let respuestas = "";
for (const [k, v] of Object.entries(qa)) {
  if (k.endsWith("_question") || k.endsWith("_response")) continue;
  if (!v) continue;
  respuestas += String(v).trim() + "\\n\\n";
}

// Si no resolvió setter Y no hay UTM → agenda de landing.
// Si no resolvió pero SI hay UTM → la UTM no está mapeada, dejamos la UTM crudo para diagnosticar.
let setterFinal;
if (setterNombre) {
  setterFinal = setterNombre;
} else if (!hasUtm) {
  setterFinal = "Es de landing";
} else {
  setterFinal = \`Sin asignar (UTM: \${utmMedium || "—"}/\${utmContent || "—"})\`;
}

const lines = [
  \`📅 **Nueva Agenda: \${eventName}**\`,
  "",
  \`**Tipo:** \${eventName}\`,
  \`**Fecha:** \${fecha}\`,
  \`**Closer:** \${closerNombre}\`,
  \`**Setter:** \${setterFinal}\`,
  "",
  "**Respuestas del cliente:**",
  cliNombre,
  cliTel,
  "",
  respuestas.trim(),
];

const content = lines.join("\\n");

return [{ json: { content, hasUtm, setterNombre } }];
`;

// Workflow nodes (mismos que antes, solo cambia el código del Code node)
const workflow = {
  name: "iClosed → Discord (general + landing)",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "iclosed-discord",
        responseMode: "onReceived",
        responseData: "noData",
        responseCode: 200,
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
      name: "Armar Mensaje (con setter)",
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
      main: [[{ node: "Armar Mensaje (con setter)", type: "main", index: 0 }]],
    },
    "Armar Mensaje (con setter)": {
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

const res = await fetch(`${N8N}/workflows/${WORKFLOW_ID}`, {
  method: "PUT",
  headers: {
    "X-N8N-API-KEY": KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(workflow),
});

const json = await res.json();
if (!res.ok) {
  console.log("✗ ERROR actualizando:");
  console.log(JSON.stringify(json, null, 2));
  process.exit(1);
}
console.log(`✓ Workflow actualizado:`);
console.log(`  id:     ${json.id}`);
console.log(`  active: ${json.active}`);

// Re-activar si quedó desactivado
if (!json.active) {
  const act = await fetch(`${N8N}/workflows/${WORKFLOW_ID}/activate`, {
    method: "POST",
    headers: { "X-N8N-API-KEY": KEY },
  });
  console.log(`  re-activate: ${act.ok ? "✓" : "✗"}`);
}
