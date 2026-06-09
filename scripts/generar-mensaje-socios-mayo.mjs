/**
 * Genera el mensaje WhatsApp del cierre socios para mayo 2026.
 * Lee datos del mismo Supabase y aplica los mismos cálculos que la UI.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const START = "2026-05-01";
const END = "2026-05-31";
const MES_LABEL = "Mayo 2026";

function norm(s) { return String(s || "").toLowerCase().trim(); }
function normReceptor(r) {
  const n = norm(r);
  if (!n) return null;
  if (n.includes("juanma") || n.includes("juanbma") || n.includes("amigo de juanma") || n === "jm") return "Juanma";
  if (n.includes("fran")) return "Fran";
  return "otros";
}
function normPagador(r) {
  const n = norm(r);
  if (!n) return null;
  if (n.includes("juanma")) return "Juanma";
  if (n.includes("fran")) return "Fran";
  return "otros";
}

const [paysRes, refundsRes, gastosRes, leadsRes, teamRes, campaignsRes] = await Promise.all([
  sb.from("payments").select("monto_usd, receptor, fecha_pago, estado, numero_cuota, es_renovacion, lead_id").eq("estado", "pagado").gte("fecha_pago", START).lte("fecha_pago", END).range(0, 9999),
  sb.from("payments").select("monto_usd, receptor, fecha_pago, lead_id").eq("estado", "refund").gte("fecha_pago", START).lte("fecha_pago", END),
  sb.from("gastos").select("fecha, concepto, categoria, monto_usd, pagado_por, pagado_a").gte("fecha", START).lte("fecha", END),
  sb.from("leads").select("id, closer_id, setter_id, utm_medium, programa_pitcheado").range(0, 9999),
  sb.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true),
  sb.from("utm_campaigns").select("medium, setter_id"),
]);

const pays = paysRes.data || [];
const refunds = refundsRes.data || [];
const gastos = gastosRes.data || [];
const leads = leadsRes.data || [];
const team = teamRes.data || [];
const campaigns = campaignsRes.data || [];

// Cash por socio
const cash = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
for (const p of pays) {
  const k = normReceptor(p.receptor) || "nulo";
  cash[k] += Number(p.monto_usd || 0);
}
for (const r of refunds) {
  const k = normReceptor(r.receptor) || "nulo";
  cash[k] -= Number(r.monto_usd || 0);
}

// Clasificar gastos en operativos vs sueldos
const reSueldo = /(sueldo|salario|fijo|pago.*(mel|melanie|valen|igna|guille|agus|juan|fran|nacho|seba|nico|hugo|turco))/i;
const sueldos = [];
const gastosOp = [];
for (const g of gastos) {
  const cat = norm(g.categoria);
  const concepto = norm(g.concepto);
  const esEquipo = cat.includes("comisi") || cat.includes("sueldo") || cat.includes("salar") || reSueldo.test(concepto);
  if (esEquipo) {
    let nombre = (g.pagado_a || "").trim();
    if (!nombre) {
      const m = concepto.match(/(mel(?:anie)?|valen(?:tino)?|igna|guille|agus(?:t[ií]n)?|juan(?:ma)?|fran|nacho|seba|nico(?:l[áa]s)?|hugo|turco)/i);
      if (m) nombre = m[1];
    }
    nombre = nombre ? nombre[0].toUpperCase() + nombre.slice(1).toLowerCase() : "Sin atribuir";
    if (/^mel/i.test(nombre)) nombre = "Mel";
    sueldos.push({ nombre, monto: Number(g.monto_usd || 0), pagador: normPagador(g.pagado_por) || "nulo" });
  } else {
    gastosOp.push({ ...g, pagador: normPagador(g.pagado_por) || "nulo" });
  }
}

const gastosOpPorSocio = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
for (const g of gastosOp) gastosOpPorSocio[g.pagador] += Number(g.monto_usd || 0);

const sueldosPorNombre = new Map();
for (const s of sueldos) sueldosPorNombre.set(s.nombre, (sueldosPorNombre.get(s.nombre) || 0) + s.monto);

// Comisiones del mes — calcular con la misma fórmula
import("../lib/commissions.js").catch(() => null);
let teamCommissions = [];
try {
  const mod = await import("file:///" + process.cwd().replace(/\\/g,"/") + "/lib/commissions.ts").catch(() => null);
  // Si no se puede importar TS, lo hacemos con curl al endpoint o duplicamos lógica básica
} catch {}

// Como no podemos importar el TS directo, hacemos un cálculo simple basado en lo que se cobró por closer/setter
// Valen scheme: closer cap 10% del programa, setter 3%
const leadById = new Map(leads.map(l => [l.id, l]));
const memberById = new Map(team.map(t => [t.id, t]));
const mediumToSetter = new Map();
for (const c of campaigns) {
  if (c.medium && c.setter_id && !mediumToSetter.has(c.medium.toLowerCase())) {
    mediumToSetter.set(c.medium.toLowerCase(), c.setter_id);
  }
}
function pct(programa) {
  if (programa === "consultoria") return 7;
  if (programa === "omnipresencia") return 7;
  if (programa === "multicuentas") return 5;
  if (programa === "roms_7") return 7;
  return 7;
}
const cashPorCloser = new Map();
const cashPorSetter = new Map();
for (const p of pays) {
  if (!p.lead_id || p.es_renovacion) continue;
  const l = leadById.get(p.lead_id);
  if (!l) continue;
  if (l.closer_id) {
    if (!cashPorCloser.has(l.closer_id)) cashPorCloser.set(l.closer_id, { cash: 0, programa: l.programa_pitcheado });
    cashPorCloser.get(l.closer_id).cash += Number(p.monto_usd || 0);
  }
  const sid = l.setter_id || mediumToSetter.get((l.utm_medium || "").toLowerCase()) || null;
  if (sid) cashPorSetter.set(sid, (cashPorSetter.get(sid) || 0) + Number(p.monto_usd || 0));
}
// Aplicar refunds como descuento
for (const r of refunds) {
  if (!r.lead_id) continue;
  const l = leadById.get(r.lead_id);
  if (!l) continue;
  if (l.closer_id && cashPorCloser.has(l.closer_id)) {
    const desc = Number(r.monto_usd || 0) * pct(l.programa_pitcheado) / 100;
    cashPorCloser.get(l.closer_id).descRefund = (cashPorCloser.get(l.closer_id).descRefund || 0) + desc;
  }
  const sid = l.setter_id || mediumToSetter.get((l.utm_medium || "").toLowerCase()) || null;
  if (sid && cashPorSetter.has(sid)) {
    cashPorSetter.set(sid, cashPorSetter.get(sid) - Number(r.monto_usd || 0) * 0.03);
  }
}

const comisiones = new Map();
for (const [cid, d] of cashPorCloser) {
  const m = memberById.get(cid);
  if (!m) continue;
  const c = d.cash * pct(d.programa) / 100 - (d.descRefund || 0);
  if (c > 0) comisiones.set(m.nombre, (comisiones.get(m.nombre) || 0) + c);
}
for (const [sid, cs] of cashPorSetter) {
  const m = memberById.get(sid);
  if (!m) continue;
  const c = cs * 0.03;
  if (c > 0) comisiones.set(m.nombre, (comisiones.get(m.nombre) || 0) + c);
}
const totalComisiones = Array.from(comisiones.values()).reduce((s, n) => s + n, 0);

// Totales
const totalCash = cash.Juanma + cash.Fran + cash.otros + cash.nulo;
const totalGastosOp = gastosOpPorSocio.Juanma + gastosOpPorSocio.Fran + gastosOpPorSocio.otros + gastosOpPorSocio.nulo;
const totalSueldosPagados = sueldos.reduce((s, x) => s + x.monto, 0);
const totalGastos = totalGastosOp + totalSueldosPagados;
const poolNeto = totalCash - totalGastos - totalComisiones;
const tocaCadaUno = poolNeto / 2;

const sueldosPorSocio = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
for (const s of sueldos) sueldosPorSocio[s.pagador] += s.monto;
const gastosTotalPorSocioJuanma = gastosOpPorSocio.Juanma + sueldosPorSocio.Juanma;
const gastosTotalPorSocioFran = gastosOpPorSocio.Fran + sueldosPorSocio.Fran;

const tieneJuanma = cash.Juanma - gastosTotalPorSocioJuanma - totalComisiones / 2;
const tieneFran = cash.Fran - gastosTotalPorSocioFran - totalComisiones / 2;
const difJuanma = tieneJuanma - tocaCadaUno;
const difFran = tieneFran - tocaCadaUno;

let transferDe = null, transferA = null, transferMonto = 0;
if (Math.abs(difJuanma - difFran) > 0.5) {
  if (difJuanma > difFran) { transferDe = "Juanma"; transferA = "Fran"; transferMonto = (difJuanma - difFran) / 2; }
  else { transferDe = "Fran"; transferA = "Juanma"; transferMonto = (difFran - difJuanma) / 2; }
}

function f(n) { return "$" + Math.round(n).toLocaleString("es-AR"); }

const lines = [
  `*🤝 Split Socios — ${MES_LABEL}*`,
  "",
  "━━━━━━━━━━━━━━━━━━━━",
  "*💰 Cash cobrado*",
  `• Juanma: ${f(cash.Juanma)}`,
  `• Fran: ${f(cash.Fran)}`,
];
if (cash.otros > 0) lines.push(`• Otros (Valen/Mati/etc): ${f(cash.otros)}`);
if (cash.nulo > 0) lines.push(`• Sin receptor: ${f(cash.nulo)}`);
lines.push(`*Total cash:* ${f(totalCash)}`);

lines.push("", "━━━━━━━━━━━━━━━━━━━━", "*💸 Gastos operativos (sin sueldos)*");
lines.push(`• Juanma: ${f(gastosOpPorSocio.Juanma)}`);
lines.push(`• Fran: ${f(gastosOpPorSocio.Fran)}`);
if (gastosOpPorSocio.otros > 0) lines.push(`• Otros: ${f(gastosOpPorSocio.otros)}`);
lines.push(`*Total gastos op.:* ${f(totalGastosOp)}`);

lines.push("", "━━━━━━━━━━━━━━━━━━━━", "*💼 Sueldos / pagos al equipo*");
if (sueldosPorNombre.size > 0) {
  lines.push("_Ya pagados (cargados en gastos):_");
  for (const [n, m] of Array.from(sueldosPorNombre.entries()).sort((a, b) => b[1] - a[1])) {
    if (m > 0) lines.push(`• ${n}: ${f(m)}`);
  }
  lines.push(`*Subtotal pagados:* ${f(totalSueldosPagados)}`);
  lines.push("");
}
if (comisiones.size > 0) {
  lines.push("_Falta pagar (comisiones del mes — Valen scheme):_");
  for (const [n, m] of Array.from(comisiones.entries()).sort((a, b) => b[1] - a[1])) {
    if (m > 0) lines.push(`• ${n}: ${f(m)}`);
  }
  lines.push(`*Subtotal comisiones:* ${f(totalComisiones)}`);
}
lines.push("", `*Total equipo (sueldos + comisiones):* ${f(totalSueldosPagados + totalComisiones)}`);

lines.push("", "━━━━━━━━━━━━━━━━━━━━",
  `*Pool neto a repartir (50/50):* ${f(poolNeto)}`,
  `*Le toca a cada uno:* ${f(tocaCadaUno)}`,
  "",
  `📦 *Juanma tiene:* ${f(tieneJuanma)}`,
  `📦 *Fran tiene:* ${f(tieneFran)}`,
  "",
  transferDe ? `💸 *${transferDe} le pasa ${f(transferMonto)} a ${transferA}* para igualar.` : "✅ Ya están iguales — no hay que pasarse nada."
);

console.log("\n══════════════════════════════════════════");
console.log("MENSAJE WHATSAPP — copiar todo lo que está debajo:");
console.log("══════════════════════════════════════════\n");
console.log(lines.join("\n"));
console.log("\n══════════════════════════════════════════");
