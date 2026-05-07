import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtUSD(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtFecha(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const fecha = url.searchParams.get("fecha");
  const tipo = url.searchParams.get("tipo") || "diario"; // diario | semanal | mensual
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }

  // Calcular rango
  let desde: string, hasta: string, titulo: string;
  const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  if (tipo === "semanal") {
    const d = parseDate(fecha);
    const dow = d.getDay();
    const offsetToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d);
    mon.setDate(d.getDate() + offsetToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    desde = toISO(mon);
    hasta = toISO(sun);
    titulo = `SEMANA ${fmtFecha(desde)} — ${fmtFecha(hasta)}`;
  } else if (tipo === "mensual") {
    const d = parseDate(fecha);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    desde = toISO(first);
    hasta = toISO(last);
    titulo = `MES ${MONTH_NAMES[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
  } else {
    desde = fecha;
    hasta = fecha;
    titulo = `DIA ${fmtFecha(fecha)}`;
  }

  const sb = createServerClient();

  // Agendas nuevas: fecha_agendado en rango
  const { data: agendadasRaw } = await sb
    .from("leads")
    .select("id, nombre, estado, setter_id, closer_id, utm_source, utm_medium, ticket_total, fecha_agendado, fecha_llamada")
    .gte("fecha_agendado", `${desde}T00:00:00`)
    .lte("fecha_agendado", `${hasta}T23:59:59`);

  // Llamadas: fecha_llamada en rango
  const { data: llamadasRaw } = await sb
    .from("leads")
    .select("id, nombre, estado, setter_id, closer_id, utm_source, utm_medium, ticket_total, fecha_llamada")
    .gte("fecha_llamada", `${desde}T00:00:00`)
    .lte("fecha_llamada", `${hasta}T23:59:59`);

  // Payments en rango
  const { data: payments } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor")
    .eq("estado", "pagado")
    .gte("fecha_pago", desde)
    .lte("fecha_pago", hasta);

  const { data: team } = await sb
    .from("team_members")
    .select("id, nombre, is_setter, is_closer");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre] as const));

  const { data: campaigns } = await sb
    .from("utm_campaigns")
    .select("medium, setter_id");
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns || []) {
    if (c.setter_id && c.medium) mediumToSetter.set(String(c.medium).toLowerCase(), c.setter_id);
  }

  const agendadas = agendadasRaw || [];
  const llamadas = llamadasRaw || [];

  const notTaken = new Set(["pendiente", "cancelada", "no_show", "reprogramada"]);
  const tomadas = llamadas.filter((l) => !notTaken.has(l.estado));
  const cerradasByCall = llamadas.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento");

  const cashTotal = (payments || []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);

  // Ventas del período = leads únicos con pago en el rango (atribuidos a closer)
  // Esto refleja "cuántos cerró cada closer" basado en el cobro, no en fecha_llamada.
  const leadIdsConPago = new Set<string>();
  for (const p of payments || []) {
    if (p.lead_id) leadIdsConPago.add(p.lead_id);
  }
  // Fetch closer_id + ticket for those leads (a batch query)
  let leadsPaidInfo: Array<{ id: string; nombre: string; closer_id: string | null; ticket_total: number | null }> = [];
  if (leadIdsConPago.size > 0) {
    const { data } = await sb
      .from("leads")
      .select("id, nombre, closer_id, ticket_total")
      .in("id", [...leadIdsConPago]);
    leadsPaidInfo = data || [];
  }
  const ventasByCloser = new Map<string, { count: number; cash: number }>();
  const leadClosers = new Map<string, string | null>();
  const leadTickets = new Map<string, number>();
  for (const l of leadsPaidInfo) {
    leadClosers.set(l.id, l.closer_id);
    leadTickets.set(l.id, Number(l.ticket_total || 0));
  }
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    const cid = leadClosers.get(p.lead_id);
    const name = cid ? teamById.get(cid) || "¿?" : "sin_closer";
    const cur = ventasByCloser.get(name) || { count: 0, cash: 0 };
    cur.cash += Number(p.monto_usd || 0);
    ventasByCloser.set(name, cur);
  }
  // count unique leads per closer
  const leadsPerCloser = new Map<string, Set<string>>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    const cid = leadClosers.get(p.lead_id);
    const name = cid ? teamById.get(cid) || "¿?" : "sin_closer";
    if (!leadsPerCloser.has(name)) leadsPerCloser.set(name, new Set());
    leadsPerCloser.get(name)!.add(p.lead_id);
  }
  for (const [name, leadsSet] of leadsPerCloser.entries()) {
    const cur = ventasByCloser.get(name);
    if (cur) cur.count = leadsSet.size;
  }

  // Resolver setter: directo (setter_id) o via utm_medium
  function resolveSetter(l: { setter_id: string | null; utm_medium: string | null }): { sid: string | null; via: "direct" | "utm" | null } {
    if (l.setter_id) return { sid: l.setter_id, via: "direct" };
    if (l.utm_medium) {
      const sid = mediumToSetter.get(l.utm_medium.toLowerCase());
      if (sid) return { sid, via: "utm" };
    }
    return { sid: null, via: null };
  }

  // Breakdown de agendas por setter (con desglose direct vs utm) + inbound
  const bySetter = new Map<string, { direct: number; utm: number }>();
  let inboundCount = 0;
  for (const l of agendadas) {
    const { sid, via } = resolveSetter(l);
    if (!sid) {
      inboundCount++;
      continue;
    }
    const name = teamById.get(sid) || "¿?";
    const cur = bySetter.get(name) || { direct: 0, utm: 0 };
    if (via === "direct") cur.direct++;
    else cur.utm++;
    bySetter.set(name, cur);
  }

  // Fuente (utm_source) para inbound breakdown
  const inboundBySource = new Map<string, number>();
  for (const l of agendadas) {
    const { sid } = resolveSetter(l);
    if (sid) continue;
    const src = (l.utm_source || "sin_utm").toLowerCase();
    inboundBySource.set(src, (inboundBySource.get(src) || 0) + 1);
  }

  // Cerradas DE LA CALL (leads cuya fecha_llamada es en el rango y estado = cerrado/adentro)
  const cerradasCallByCloser = new Map<string, { count: number; ticket: number }>();
  for (const l of cerradasByCall) {
    const name = l.closer_id ? teamById.get(l.closer_id) || "¿?" : "sin_closer";
    const cur = cerradasCallByCloser.get(name) || { count: 0, ticket: 0 };
    cur.count++;
    cur.ticket += Number(l.ticket_total || 0);
    cerradasCallByCloser.set(name, cur);
  }

  // Cash por receptor (normalizado: trim + uppercase)
  const cashByReceptor = new Map<string, number>();
  for (const p of payments || []) {
    const raw = (p.receptor || "sin_receptor").trim();
    const key = raw === "sin_receptor" ? "sin_receptor" : raw.toUpperCase();
    cashByReceptor.set(key, (cashByReceptor.get(key) || 0) + Number(p.monto_usd || 0));
  }

  // Texto
  const lines: string[] = [];
  lines.push(`📊 *REPORTE ${titulo}*`);
  lines.push("");

  lines.push(`📅 *Agendas nuevas:* ${agendadas.length}`);
  if (bySetter.size > 0) {
    lines.push(`   👥 Atribuidas a setter: ${[...bySetter.values()].reduce((s, v) => s + v.direct + v.utm, 0)}`);
    const arr = [...bySetter.entries()].sort((a, b) => (b[1].direct + b[1].utm) - (a[1].direct + a[1].utm));
    for (const [name, v] of arr) {
      const total = v.direct + v.utm;
      const detail: string[] = [];
      if (v.direct > 0) detail.push(`${v.direct} directo`);
      if (v.utm > 0) detail.push(`${v.utm} UTM`);
      lines.push(`      • ${name}: ${total} (${detail.join(" + ")})`);
    }
  }
  if (inboundCount > 0) {
    lines.push(`   🌐 Inbound (sin setter): ${inboundCount}`);
    const arr = [...inboundBySource.entries()].sort((a, b) => b[1] - a[1]);
    for (const [src, n] of arr) lines.push(`      • ${src}: ${n}`);
  }
  lines.push("");

  lines.push(`📞 *Llamadas:* ${llamadas.length}`);
  lines.push(`   ✅ Tomadas: ${tomadas.length}`);
  lines.push(`   ❌ No tomadas: ${llamadas.length - tomadas.length}`);
  lines.push(`   💰 Cerradas en la call: ${cerradasByCall.length}`);
  if (cerradasCallByCloser.size > 0) {
    const arr = [...cerradasCallByCloser.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [name, v] of arr) {
      lines.push(`      • ${name}: ${v.count} (${fmtUSD(v.ticket)})`);
    }
  }
  lines.push("");

  // Ventas = leads con pago en el rango (por closer)
  const totalVentas = [...ventasByCloser.values()].reduce((s, v) => s + v.count, 0);
  lines.push(`🎯 *Ventas cobradas:* ${totalVentas} leads`);
  if (ventasByCloser.size > 0) {
    const arr = [...ventasByCloser.entries()].sort((a, b) => b[1].cash - a[1].cash);
    for (const [name, v] of arr) {
      lines.push(`   • ${name}: ${v.count} leads · ${fmtUSD(v.cash)}`);
    }
  }
  lines.push("");

  lines.push(`💵 *Cash cobrado:* ${fmtUSD(cashTotal)} (${payments?.length || 0} pagos)`);
  if (cashByReceptor.size > 0) {
    const arr = [...cashByReceptor.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, usd] of arr) lines.push(`   • ${name}: ${fmtUSD(usd)}`);
  }

  // ───── EXTRAS MENSUALES ─────
  if (tipo === "mensual") {
    lines.push("");
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push("");

    // Facturación = ticket de leads cuya cuota#1 se pagó en el mes
    const cuota1Pays = (payments || []).filter((p) => p.numero_cuota === 1);
    const leadsCuota1 = new Set(cuota1Pays.map((p) => p.lead_id).filter(Boolean) as string[]);
    let facturacion = 0;
    for (const id of leadsCuota1) facturacion += leadTickets.get(id) || 0;
    lines.push(`💼 *Facturación (ventas concretadas):* ${fmtUSD(facturacion)} (${leadsCuota1.size} ventas)`);

    // Por programa
    const ventasPorPrograma = new Map<string, { count: number; cash: number; ticket: number }>();
    if (leadsCuota1.size > 0) {
      const { data: lprog } = await sb
        .from("leads")
        .select("id, programa_pitcheado, ticket_total")
        .in("id", [...leadsCuota1]);
      for (const l of lprog || []) {
        const p = (l.programa_pitcheado || "otros").toLowerCase();
        const k = p.includes("multi") ? "Multicuentas" : p.includes("consult") ? "Consultoría" : p.includes("omni") ? "Omnipresencia" : p.includes("roms_7") ? "ROMS 7" : "Otros";
        const cur = ventasPorPrograma.get(k) || { count: 0, cash: 0, ticket: 0 };
        cur.count++;
        cur.ticket += Number(l.ticket_total || 0);
        ventasPorPrograma.set(k, cur);
      }
    }
    if (ventasPorPrograma.size > 0) {
      lines.push(`   📦 Por programa:`);
      const arr = [...ventasPorPrograma.entries()].sort((a, b) => b[1].ticket - a[1].ticket);
      for (const [name, v] of arr) lines.push(`      • ${name}: ${v.count} ventas · ${fmtUSD(v.ticket)}`);
    }
    lines.push("");

    // Renovaciones del mes
    const { data: renovs } = await sb
      .from("renewal_history")
      .select("id, monto_total, estado, client:clients(nombre, programa)")
      .gte("fecha_renovacion", desde)
      .lte("fecha_renovacion", hasta);
    const renovsValidas = (renovs || []).filter((r) => r.estado === "pago" && (r.monto_total || 0) > 0);
    const renovsRevenue = renovsValidas.reduce((s, r) => s + Number(r.monto_total || 0), 0);

    // Vencimientos del mes (clients que cumplen)
    const { data: clients } = await sb.from("clients").select("fecha_onboarding, total_dias_programa");
    let vencimientos = 0;
    const DAY = 86400000;
    for (const c of clients || []) {
      if (!c.fecha_onboarding) continue;
      const onb = new Date(String(c.fecha_onboarding).split("T")[0]).getTime();
      const venc = new Date(onb + (c.total_dias_programa || 90) * DAY);
      const v = toISO(venc);
      if (v >= desde && v <= hasta) vencimientos++;
    }
    const tasaRenov = vencimientos > 0 ? renovsValidas.length / vencimientos : 0;

    lines.push(`🔄 *Renovaciones:* ${renovsValidas.length} de ${vencimientos} vencimientos (${(tasaRenov * 100).toFixed(0)}%)`);
    lines.push(`   💰 Revenue de renovaciones: ${fmtUSD(renovsRevenue)}`);
    lines.push("");

    // Cobranzas pendientes (vencidas)
    const today = toISO(new Date());
    const { data: vencidas } = await sb
      .from("payments")
      .select("monto_usd")
      .eq("estado", "pendiente")
      .lte("fecha_vencimiento", today);
    const totalVencidas = (vencidas || []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    if (totalVencidas > 0) {
      lines.push(`⚠️ *Cuotas vencidas (a hoy):* ${fmtUSD(totalVencidas)} (${vencidas?.length || 0} cuotas)`);
      lines.push("");
    }

    // Gastos del mes (normalizado)
    const { data: gastos } = await sb
      .from("gastos")
      .select("monto_usd, categoria, pagado_por")
      .gte("fecha", desde)
      .lte("fecha", hasta);
    const totalGastos = (gastos || []).reduce((s, g) => s + Number(g.monto_usd || 0), 0);
    const gastosPorCat = new Map<string, number>();
    const gastosPorPersona = new Map<string, number>();
    for (const g of gastos || []) {
      const k = (g.categoria || "otros").trim().toLowerCase();
      gastosPorCat.set(k, (gastosPorCat.get(k) || 0) + Number(g.monto_usd || 0));
      const ppRaw = (g.pagado_por || "sin_asignar").trim();
      const pp = ppRaw === "sin_asignar" ? "sin_asignar" : ppRaw.toUpperCase();
      gastosPorPersona.set(pp, (gastosPorPersona.get(pp) || 0) + Number(g.monto_usd || 0));
    }
    lines.push(`📉 *Gastos del mes:* ${fmtUSD(totalGastos)} (${gastos?.length || 0} items)`);
    if (gastosPorCat.size > 0) {
      const arr = [...gastosPorCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [k, v] of arr) lines.push(`   • ${k}: ${fmtUSD(v)}`);
    }
    if (gastosPorPersona.size > 0) {
      lines.push(`   👤 Por quién gastó:`);
      const arr = [...gastosPorPersona.entries()].sort((a, b) => b[1] - a[1]);
      for (const [k, v] of arr) lines.push(`      • ${k}: ${fmtUSD(v)}`);
    }
    lines.push("");

    // Resultado neto aproximado (cash - gastos)
    const resultadoNetoCash = cashTotal - totalGastos;
    lines.push(`💎 *Resultado neto (cash):* ${fmtUSD(resultadoNetoCash)}`);
    lines.push(`   = Cash ${fmtUSD(cashTotal)} − Gastos ${fmtUSD(totalGastos)}`);
    lines.push("");
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Reporte generado ${new Date().toLocaleString("es-AR")}`);
  }

  return NextResponse.json({ text: lines.join("\n"), rango: { desde, hasta } });
}
