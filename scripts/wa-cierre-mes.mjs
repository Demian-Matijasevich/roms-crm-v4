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

// Por defecto: mes vigente del calendario. Override con argv[2] tipo "2026-05".
const arg = process.argv[2];
const now = new Date();
const targetYM = arg || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const [year, month] = targetYM.split("-").map(Number);
const startStr = `${targetYM}-01`;
const lastDay = new Date(year, month, 0).getDate();
const endStr = `${targetYM}-${String(lastDay).padStart(2, "0")}`;

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesLabel = `${MESES[month - 1]} ${year}`;

const fmt = (n) => "$" + Math.round(Number(n || 0)).toLocaleString("es-AR");

async function main() {
  // ── Cash collected del mes (todos los pagados con fecha_pago en el mes) ──
  const { data: pagos } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, monto_ars, fecha_pago, estado, numero_cuota, es_renovacion, descuento_comision_closer_usd, descuento_comision_setter_usd, lead:leads!payments_lead_id_fkey(nombre, programa_pitcheado, ticket_total, closer_id, setter_id, utm_medium, estado)")
    .gte("fecha_pago", startStr)
    .lte("fecha_pago", endStr)
    .range(0, 9999);

  // ── Team members ──
  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter, activo");
  const memberById = new Map(team.map((t) => [t.id, t]));

  // ── Refunds del mes (estado=refund) ──
  const refunds = (pagos || []).filter((p) => p.estado === "refund");
  const pagosOK = (pagos || []).filter((p) => p.estado === "pagado");

  const cashTotal = pagosOK.reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const cashVentasNuevas = pagosOK
    .filter((p) => p.numero_cuota === 1 && !p.es_renovacion)
    .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const cashCuotas = pagosOK
    .filter((p) => p.numero_cuota > 1 && !p.es_renovacion)
    .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const cashRenovaciones = pagosOK.filter((p) => p.es_renovacion).reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const refundsTotal = refunds.reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const cashNeto = cashTotal - refundsTotal;

  // ── Ventas firmadas (leads cerrados en el mes con c1 pagada) ──
  const leadsConC1 = new Map();
  for (const p of pagosOK) {
    if (p.numero_cuota !== 1 || p.es_renovacion) continue;
    if (!p.lead_id) continue;
    if (!leadsConC1.has(p.lead_id)) leadsConC1.set(p.lead_id, p);
  }
  const ventasFirmadasTotal = [...leadsConC1.values()].reduce(
    (s, p) => s + Number(p.lead?.ticket_total || 0),
    0
  );
  const cantidadVentas = leadsConC1.size;
  const aov = cantidadVentas > 0 ? ventasFirmadasTotal / cantidadVentas : 0;

  // ── Cuotas que NO entraron (vencidas en el mes que NO se pagaron) ──
  const { data: pendientesVencidasMes } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_vencimiento, numero_cuota, lead:leads!payments_lead_id_fkey(nombre)")
    .eq("estado", "pendiente")
    .gte("fecha_vencimiento", startStr)
    .lte("fecha_vencimiento", endStr)
    .range(0, 9999);
  const cuotasNoCobradas = pendientesVencidasMes || [];
  const cuotasNoCobradasTotal = cuotasNoCobradas.reduce((s, p) => s + Number(p.monto_usd || 0), 0);

  // ── Comisiones por closer (10% × pagados − descuento_closer) ──
  // Calcular por lead_id → closer_id × monto pagado en el mes.
  const closerAgg = new Map(); // id → { nombre, cobrado, desc }
  const setterAgg = new Map(); // id → { nombre, cobrado, desc }

  // Fetch utm_campaigns para attribution de setter cuando no hay setter_id en lead
  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");
  const setterByMedium = new Map();
  for (const c of campaigns || []) if (c.medium && c.setter_id) setterByMedium.set(c.medium.toLowerCase(), c.setter_id);

  for (const p of pagosOK) {
    const lead = p.lead || {};
    const closerId = lead.closer_id;
    const setterId = lead.setter_id || setterByMedium.get(String(lead.utm_medium || "").toLowerCase()) || null;
    const monto = Number(p.monto_usd || 0);
    const descCloser = Number(p.descuento_comision_closer_usd || 0);
    const descSetter = Number(p.descuento_comision_setter_usd || 0);

    if (closerId) {
      const m = memberById.get(closerId);
      if (m?.is_closer) {
        if (!closerAgg.has(closerId)) closerAgg.set(closerId, { nombre: m.nombre, cobrado: 0, desc: 0 });
        const a = closerAgg.get(closerId);
        a.cobrado += monto;
        a.desc += descCloser;
      }
    }
    if (setterId) {
      const m = memberById.get(setterId);
      if (m?.is_setter) {
        if (!setterAgg.has(setterId)) setterAgg.set(setterId, { nombre: m.nombre, cobrado: 0, desc: 0 });
        const a = setterAgg.get(setterId);
        a.cobrado += monto;
        a.desc += descSetter;
      }
    }
  }

  // También considerar refunds para los descuentos (estado=refund también lleva descuento)
  for (const p of refunds) {
    const lead = p.lead || {};
    const closerId = lead.closer_id;
    const setterId = lead.setter_id || setterByMedium.get(String(lead.utm_medium || "").toLowerCase()) || null;
    const descCloser = Number(p.descuento_comision_closer_usd || 0);
    const descSetter = Number(p.descuento_comision_setter_usd || 0);
    if (closerId && memberById.get(closerId)?.is_closer) {
      if (!closerAgg.has(closerId)) closerAgg.set(closerId, { nombre: memberById.get(closerId).nombre, cobrado: 0, desc: 0 });
      closerAgg.get(closerId).desc += descCloser;
    }
    if (setterId && memberById.get(setterId)?.is_setter) {
      if (!setterAgg.has(setterId)) setterAgg.set(setterId, { nombre: memberById.get(setterId).nombre, cobrado: 0, desc: 0 });
      setterAgg.get(setterId).desc += descSetter;
    }
  }

  // ── Armar mensaje WA ──
  const lines = [];
  lines.push(`*📊 Cierre de Mes — ${mesLabel}*`);
  lines.push(`_ROMS · período ${startStr} → ${endStr}_`);
  lines.push("");

  lines.push("*💰 LO QUE ENTRÓ*");
  lines.push(`• Cash total: *${fmt(cashTotal)}*`);
  lines.push(`   ↳ Ventas nuevas (c1): ${fmt(cashVentasNuevas)}`);
  lines.push(`   ↳ Cuotas (c2+): ${fmt(cashCuotas)}`);
  lines.push(`   ↳ Renovaciones: ${fmt(cashRenovaciones)}`);
  if (refundsTotal > 0) {
    lines.push(`• Refunds: −${fmt(refundsTotal)}`);
    lines.push(`• *Cash neto: ${fmt(cashNeto)}*`);
  }
  lines.push("");

  lines.push("*✍️ VENTAS FIRMADAS*");
  lines.push(`• ${cantidadVentas} cierres por *${fmt(ventasFirmadasTotal)}* (AOV ${fmt(aov)})`);
  lines.push("");

  lines.push("*⏰ LO QUE NO ENTRÓ (cuotas vencidas no cobradas)*");
  if (cuotasNoCobradas.length === 0) {
    lines.push("• Todo cobrado ✅");
  } else {
    lines.push(`• ${cuotasNoCobradas.length} cuotas por *${fmt(cuotasNoCobradasTotal)}*`);
    cuotasNoCobradas
      .sort((a, b) => Number(b.monto_usd) - Number(a.monto_usd))
      .slice(0, 10)
      .forEach((p) => {
        const nom = p.lead?.nombre || "(s/n)";
        lines.push(`   ↳ ${nom} c${p.numero_cuota} — ${fmt(p.monto_usd)}`);
      });
    if (cuotasNoCobradas.length > 10) lines.push(`   _+ ${cuotasNoCobradas.length - 10} más_`);
  }
  lines.push("");

  if (refunds.length > 0) {
    lines.push("*↩ REFUNDS DEL MES*");
    refunds.forEach((p) => {
      const nom = p.lead?.nombre || "(s/n)";
      lines.push(`• ${nom} — ${fmt(p.monto_usd)}`);
    });
    lines.push("");
  }

  lines.push("*🏆 COMISIONES CLOSERS (10% − descuentos)*");
  const closerSorted = [...closerAgg.values()].sort((a, b) => b.cobrado - a.cobrado);
  if (closerSorted.length === 0) {
    lines.push("• Sin datos");
  } else {
    let totalClosers = 0;
    closerSorted.forEach((c) => {
      const com = c.cobrado * 0.1 - c.desc;
      totalClosers += com;
      const descStr = c.desc > 0 ? ` (− ${fmt(c.desc)} descuento)` : "";
      lines.push(`• ${c.nombre}: *${fmt(com)}* · base ${fmt(c.cobrado)}${descStr}`);
    });
    lines.push(`   Total closers: *${fmt(totalClosers)}*`);
  }
  lines.push("");

  lines.push("*💬 COMISIONES SETTERS (5% − descuentos)*");
  const setterSorted = [...setterAgg.values()].sort((a, b) => b.cobrado - a.cobrado);
  if (setterSorted.length === 0) {
    lines.push("• Sin datos");
  } else {
    let totalSetters = 0;
    setterSorted.forEach((s) => {
      const com = s.cobrado * 0.05 - s.desc;
      totalSetters += com;
      const descStr = s.desc > 0 ? ` (− ${fmt(s.desc)} descuento)` : "";
      lines.push(`• ${s.nombre}: *${fmt(com)}* · base ${fmt(s.cobrado)}${descStr}`);
    });
    lines.push(`   Total setters: *${fmt(totalSetters)}*`);
  }
  lines.push("");

  lines.push(`_Generado ${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}_`);

  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
