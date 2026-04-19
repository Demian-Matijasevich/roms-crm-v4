import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

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
  const tipo = url.searchParams.get("tipo") || "diario"; // diario | semanal
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }

  // Calcular rango
  let desde: string, hasta: string, titulo: string;
  if (tipo === "semanal") {
    // Semana ISO (lunes a domingo) que contiene la fecha
    const d = parseDate(fecha);
    const dow = d.getDay(); // 0=dom, 1=lun...
    const offsetToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d);
    mon.setDate(d.getDate() + offsetToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    desde = toISO(mon);
    hasta = toISO(sun);
    titulo = `SEMANA ${fmtFecha(desde)} — ${fmtFecha(hasta)}`;
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
  const cerradas = llamadas.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento");

  const cashTotal = (payments || []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);

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

  // Cerradas por closer
  const cerradasByCloser = new Map<string, { count: number; ticket: number }>();
  for (const l of cerradas) {
    const name = l.closer_id ? teamById.get(l.closer_id) || "¿?" : "sin_closer";
    const cur = cerradasByCloser.get(name) || { count: 0, ticket: 0 };
    cur.count++;
    cur.ticket += Number(l.ticket_total || 0);
    cerradasByCloser.set(name, cur);
  }

  // Cash por receptor
  const cashByReceptor = new Map<string, number>();
  for (const p of payments || []) {
    const key = p.receptor || "sin_receptor";
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
  lines.push(`   💰 Cerradas: ${cerradas.length}`);
  if (cerradasByCloser.size > 0) {
    const arr = [...cerradasByCloser.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [name, v] of arr) {
      lines.push(`      • ${name}: ${v.count} (${fmtUSD(v.ticket)})`);
    }
  }
  lines.push("");

  lines.push(`💵 *Cash cobrado:* ${fmtUSD(cashTotal)} (${payments?.length || 0} pagos)`);
  if (cashByReceptor.size > 0) {
    const arr = [...cashByReceptor.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, usd] of arr) lines.push(`   • ${name}: ${fmtUSD(usd)}`);
  }

  return NextResponse.json({ text: lines.join("\n"), rango: { desde, hasta } });
}
