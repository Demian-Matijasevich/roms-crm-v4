/**
 * Genera el mensaje WA detallado de comisiones del mes para mandar a Juanma.
 * Uso: node scripts/wa-comisiones.mjs [YYYY-MM]    (default = mes vigente)
 *
 * Esquema Valen (lib/commissions.ts):
 *   Closer: Omni 7%, Multi 5%, Consult 7% × tier (≤70k=1x, 70-100k=1.15x, >100k=1.3x), cap 10%
 *   Setter: 3% flat
 *   Refunds restan descuento_comision_closer_usd / setter_usd manualmente asignado por admin
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const arg = process.argv[2];
// IDs de refunds a IGNORAR (ya contabilizados en un mes anterior)
// Uso: node scripts/wa-comisiones.mjs 2026-05 --skip-refunds=id1,id2
const skipArg = process.argv.find((a) => a.startsWith("--skip-refunds="));
const skipRefundIds = new Set(
  skipArg ? skipArg.replace("--skip-refunds=", "").split(",").filter(Boolean) : []
);
const now = new Date();
const targetYM = arg || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const [year, month] = targetYM.split("-").map(Number);
const startStr = `${targetYM}-01`;
const lastDay = new Date(year, month, 0).getDate();
const endStr = `${targetYM}-${String(lastDay).padStart(2, "0")}`;
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const mesLabel = `${MESES[month - 1]} ${year}`;

const fmt = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  // Mostrar decimales solo cuando hay decimales reales
  const hasDecimals = Math.abs(v - Math.round(v)) > 0.01;
  return "$" + (hasDecimals ? v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString("es-AR"));
};

function programaKey(programa) {
  const p = (programa || "").toLowerCase();
  if (p.includes("multi")) return "multi";
  if (p.includes("consult")) return "consultoria";
  if (p.includes("omni")) return "omni";
  return "otro";
}
const PROGRAMA_LABEL = {
  omni: "Omnipresencia",
  multi: "Multicuentas",
  consultoria: "Consultoría",
  otro: "Otros",
};
function basePct(key) {
  if (key === "multi") return 5;
  return 7; // omni y consult
}
function tierMul(cash) {
  if (cash <= 70000) return 1.0;
  if (cash <= 100000) return 1.15;
  return 1.3;
}
function tierLabel(cash) {
  const m = tierMul(cash);
  if (m === 1) return "x1";
  if (m === 1.15) return "x1.15 (>70k)";
  return "x1.3 (>100k)";
}

async function main() {
  // 1) Team members
  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true);
  const memberById = new Map(team.map((t) => [t.id, t]));

  // 2) UTM campaigns para attribution setter
  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");
  const mediumToSetter = new Map();
  for (const c of campaigns || []) {
    if (c.setter_id && c.medium) mediumToSetter.set(c.medium.toLowerCase(), c.setter_id);
  }
  const resolveSetter = (lead) => {
    if (lead.setter_id) return lead.setter_id;
    if (lead.utm_medium) return mediumToSetter.get(String(lead.utm_medium).toLowerCase()) || null;
    return null;
  };

  // 3) Pagos del mes (PAGADOS para comisiones, REFUND para descuentos)
  const { data: pagosRaw } = await sb
    .from("payments")
    .select(`id, lead_id, numero_cuota, monto_usd, fecha_pago, estado, es_renovacion,
             descuento_comision_closer_usd, descuento_comision_setter_usd,
             lead:leads!payments_lead_id_fkey(id, nombre, closer_id, setter_id, utm_medium, programa_pitcheado)`)
    .gte("fecha_pago", startStr)
    .lte("fecha_pago", endStr)
    .range(0, 9999);

  const pagosOK = (pagosRaw || []).filter((p) => p.estado === "pagado");
  const refunds = (pagosRaw || []).filter((p) => p.estado === "refund" && !skipRefundIds.has(p.id));
  const skipped = (pagosRaw || []).filter((p) => p.estado === "refund" && skipRefundIds.has(p.id));
  if (skipped.length > 0) {
    console.error(`# Refunds excluidos (ya contabilizados en mes anterior):`);
    skipped.forEach((s) => console.error(`#   - ${s.lead?.nombre || "(s/n)"} $${s.monto_usd} (${s.fecha_pago})`));
    console.error("");
  }

  // 4) Cash atribuido a cada closer y setter
  const closerData = new Map(); // closer_id → { nombre, cash, pays:[], descRefunds:[] }
  const setterData = new Map(); // setter_id → { nombre, cash, pays:[], descRefunds:[] }

  for (const p of pagosOK) {
    const l = p.lead;
    if (!l) continue;
    const monto = Number(p.monto_usd || 0);
    if (l.closer_id) {
      const m = memberById.get(l.closer_id);
      if (m?.is_closer) {
        if (!closerData.has(l.closer_id)) closerData.set(l.closer_id, { nombre: m.nombre, cash: 0, pays: [], descRefunds: [] });
        const acc = closerData.get(l.closer_id);
        acc.cash += monto;
        acc.pays.push({
          cliente: l.nombre || "(s/n)",
          numero_cuota: p.numero_cuota,
          monto,
          programa: l.programa_pitcheado || "otro",
        });
      }
    }
    const sid = resolveSetter(l);
    if (sid) {
      const m = memberById.get(sid);
      if (m?.is_setter) {
        if (!setterData.has(sid)) setterData.set(sid, { nombre: m.nombre, cash: 0, pays: [], descRefunds: [] });
        const acc = setterData.get(sid);
        acc.cash += monto;
        acc.pays.push({
          cliente: l.nombre || "(s/n)",
          numero_cuota: p.numero_cuota,
          monto,
        });
      }
    }
  }

  // 5) Refunds: asignar descuentos a closer/setter del lead
  // Si el admin NO cargó descuento manual (== 0), calculamos el descuento DEFAULT
  // como lo que el equipo hubiera ganado de comisión por ese pago, usando el tier
  // efectivo del closer en el mes (basado en su cash del mes).
  const refundsList = [];
  for (const r of refunds) {
    const l = r.lead;
    if (!l) continue;
    const monto = Number(r.monto_usd || 0);
    let descCloser = Number(r.descuento_comision_closer_usd || 0);
    let descSetter = Number(r.descuento_comision_setter_usd || 0);
    // Default automático si está en 0
    if (descCloser === 0 && l.closer_id) {
      const closerCash = closerData.get(l.closer_id)?.cash || 0;
      const mul = tierMul(closerCash);
      const pctEff = Math.min(basePct(programaKey(l.programa_pitcheado)) * mul, 10);
      descCloser = monto * (pctEff / 100);
    }
    if (descSetter === 0) {
      const sid = resolveSetter(l);
      if (sid) descSetter = monto * 0.03;
    }
    refundsList.push({
      cliente: l.nombre || "(s/n)",
      monto: Number(r.monto_usd || 0),
      programa: l.programa_pitcheado || "otro",
      closer_id: l.closer_id,
      closer_nombre: l.closer_id ? memberById.get(l.closer_id)?.nombre : null,
      setter_id: resolveSetter(l),
      setter_nombre: resolveSetter(l) ? memberById.get(resolveSetter(l))?.nombre : null,
      desc_closer: descCloser,
      desc_setter: descSetter,
    });
    if (l.closer_id && descCloser > 0 && closerData.has(l.closer_id)) {
      closerData.get(l.closer_id).descRefunds.push({ cliente: l.nombre, monto: descCloser });
    } else if (l.closer_id && descCloser > 0) {
      // Closer no tuvo cash este mes pero igual le descuentan
      const m = memberById.get(l.closer_id);
      if (m?.is_closer) {
        closerData.set(l.closer_id, { nombre: m.nombre, cash: 0, pays: [], descRefunds: [{ cliente: l.nombre, monto: descCloser }] });
      }
    }
    const sid = resolveSetter(l);
    if (sid && descSetter > 0 && setterData.has(sid)) {
      setterData.get(sid).descRefunds.push({ cliente: l.nombre, monto: descSetter });
    } else if (sid && descSetter > 0) {
      const m = memberById.get(sid);
      if (m?.is_setter) {
        setterData.set(sid, { nombre: m.nombre, cash: 0, pays: [], descRefunds: [{ cliente: l.nombre, monto: descSetter }] });
      }
    }
  }

  // ── Construir mensaje ──
  const lines = [];
  const SEP = "═══════════════════════════════════════════════";
  lines.push(SEP);
  lines.push(`💼 COMISIONES A PAGAR - ${mesLabel}`);
  lines.push(SEP);
  lines.push("");

  // Refunds aplicados
  if (refundsList.length > 0) {
    lines.push("🔄 Refunds aplicados:");
    for (const r of refundsList) {
      const progAbbr = programaKey(r.programa) === "consultoria" ? "Consult"
        : programaKey(r.programa) === "multi" ? "Multi"
        : programaKey(r.programa) === "omni" ? "Omni" : "Otro";
      const parts = [];
      if (r.closer_nombre && r.desc_closer > 0) parts.push(`${r.closer_nombre} −${fmt(r.desc_closer)}`);
      if (r.setter_nombre && r.desc_setter > 0) parts.push(`${r.setter_nombre} −${fmt(r.desc_setter)}`);
      const partStr = parts.length > 0 ? " → " + parts.join(" · ") : "";
      lines.push(`   • ${r.cliente} — ${fmt(r.monto)} ${progAbbr}${partStr}`);
    }
    lines.push("");
  }

  // Per closer
  const allCloserIds = [...closerData.keys()].sort((a, b) => closerData.get(b).cash - closerData.get(a).cash);
  for (const cid of allCloserIds) {
    const acc = closerData.get(cid);
    lines.push(SEP);
    lines.push(`💼 ${acc.nombre.toUpperCase()}`);
    const mul = tierMul(acc.cash);
    lines.push(`💰 Cash closer: ${fmt(acc.cash)} · Tier ${tierLabel(acc.cash)}`);
    lines.push("");

    // Group pays by program
    const byProg = { omni: [], multi: [], consultoria: [], otro: [] };
    for (const p of acc.pays) byProg[programaKey(p.programa)].push(p);

    let comTotal = 0;
    for (const progKey of ["omni", "multi", "consultoria", "otro"]) {
      const list = byProg[progKey];
      if (list.length === 0) continue;
      const pctEff = Math.min(basePct(progKey) * mul, 10);
      lines.push(`📦 ${PROGRAMA_LABEL[progKey]} (${pctEff.toFixed(2).replace(/\.00$/, "")}%)`);
      let subtotalCash = 0;
      for (const p of list) {
        const com = p.monto * (pctEff / 100);
        subtotalCash += p.monto;
        lines.push(`   • ${p.cliente} (c#${p.numero_cuota}): ${fmt(p.monto)} → ${fmt(com)}`);
      }
      const subtotalCom = subtotalCash * (pctEff / 100);
      comTotal += subtotalCom;
      lines.push(`   ▸ Subtotal ${PROGRAMA_LABEL[progKey]}: ${fmt(subtotalCash)} × ${pctEff.toFixed(2).replace(/\.00$/, "")}% = ${fmt(subtotalCom)}`);
      lines.push("");
    }

    // Si también es setter, sumar setter
    const memb = memberById.get(cid);
    let comSetter = 0;
    if (memb?.is_setter && setterData.has(cid)) {
      const setAcc = setterData.get(cid);
      lines.push("👥 COMO SETTER (3% flat)");
      lines.push(`   ▸ Cash atribuido: ${fmt(setAcc.cash)} × 3% = ${fmt(setAcc.cash * 0.03)}`);
      comSetter = setAcc.cash * 0.03;
      lines.push("");
    }

    const bruto = comTotal + comSetter;
    const descTotal = acc.descRefunds.reduce((s, r) => s + r.monto, 0);
    const descSet = memb?.is_setter && setterData.has(cid) ? setterData.get(cid).descRefunds.reduce((s, r) => s + r.monto, 0) : 0;
    const totalDesc = descTotal + descSet;
    lines.push(`   Bruto: ${fmt(bruto)}`);
    if (acc.descRefunds.length > 0) {
      for (const r of acc.descRefunds) lines.push(`   🔄 Refund ${r.cliente}: −${fmt(r.monto)}`);
    }
    if (memb?.is_setter && setterData.has(cid)) {
      const setAcc = setterData.get(cid);
      for (const r of setAcc.descRefunds) lines.push(`   🔄 Refund setter ${r.cliente}: −${fmt(r.monto)}`);
    }
    if (totalDesc > 0) {
      lines.push(`   ─────────────────────────`);
      lines.push(`   Descuentos: −${fmt(totalDesc)}`);
    }
    lines.push(`💎 TOTAL ${acc.nombre.toUpperCase()}: ${fmt(bruto - totalDesc)}`);
    lines.push("");
  }

  // Solo setters (no closers) que tuvieron cash
  const onlySetters = [...setterData.entries()].filter(([id]) => {
    const m = memberById.get(id);
    return m && m.is_setter && !m.is_closer;
  });
  for (const [sid, acc] of onlySetters) {
    lines.push(SEP);
    lines.push(`💼 ${acc.nombre.toUpperCase()} (solo setter)`);
    lines.push("");
    lines.push("👥 Setter (3%)");
    for (const p of acc.pays) {
      const com = p.monto * 0.03;
      lines.push(`   • ${p.cliente}: ${fmt(p.monto)} → ${fmt(com)}`);
    }
    const bruto = acc.cash * 0.03;
    lines.push(`   ▸ Cash setter: ${fmt(acc.cash)} × 3% = ${fmt(bruto)}`);
    lines.push("");
    const descTotal = acc.descRefunds.reduce((s, r) => s + r.monto, 0);
    lines.push(`   Bruto: ${fmt(bruto)}`);
    if (acc.descRefunds.length > 0) {
      for (const r of acc.descRefunds) lines.push(`   🔄 Refund ${r.cliente}: −${fmt(r.monto)}`);
    }
    if (descTotal > 0) {
      lines.push(`   ─────────────────────────`);
      lines.push(`   Descuentos: −${fmt(descTotal)}`);
    }
    lines.push(`💎 TOTAL ${acc.nombre.toUpperCase()}: ${fmt(bruto - descTotal)}`);
    lines.push("");
  }

  // Resumen final
  lines.push(SEP);
  lines.push("📊 RESUMEN A PAGAR");
  lines.push("");
  const finalRows = [];
  let totalFinal = 0;
  let totalDescuentos = 0;
  for (const cid of allCloserIds) {
    const acc = closerData.get(cid);
    const memb = memberById.get(cid);
    const mul = tierMul(acc.cash);
    let comCloser = 0;
    for (const p of acc.pays) {
      const pctEff = Math.min(basePct(programaKey(p.programa)) * mul, 10);
      comCloser += p.monto * (pctEff / 100);
    }
    const comSetter = memb?.is_setter && setterData.has(cid) ? setterData.get(cid).cash * 0.03 : 0;
    const descCloser = acc.descRefunds.reduce((s, r) => s + r.monto, 0);
    const descSetter = memb?.is_setter && setterData.has(cid) ? setterData.get(cid).descRefunds.reduce((s, r) => s + r.monto, 0) : 0;
    const totalNeto = comCloser + comSetter - descCloser - descSetter;
    finalRows.push({ nombre: acc.nombre, total: totalNeto });
    totalFinal += totalNeto;
    totalDescuentos += descCloser + descSetter;
  }
  for (const [sid, acc] of onlySetters) {
    const bruto = acc.cash * 0.03;
    const desc = acc.descRefunds.reduce((s, r) => s + r.monto, 0);
    const neto = bruto - desc;
    finalRows.push({ nombre: acc.nombre, total: neto });
    totalFinal += neto;
    totalDescuentos += desc;
  }
  finalRows.sort((a, b) => b.total - a.total);
  const maxNameLen = Math.max(...finalRows.map((r) => r.nombre.length));
  for (const r of finalRows) {
    lines.push(`   • ${r.nombre.padEnd(maxNameLen + 2, " ")}${fmt(r.total)}`);
  }
  lines.push(`   ─────────────────────────`);
  lines.push(`   TOTAL:${" ".repeat(Math.max(1, maxNameLen - 3))}${fmt(totalFinal)}`);
  if (totalDescuentos > 0) {
    lines.push("");
    lines.push(`   (Ahorro por refunds: ${fmt(totalDescuentos)})`);
  }
  lines.push(SEP);

  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
