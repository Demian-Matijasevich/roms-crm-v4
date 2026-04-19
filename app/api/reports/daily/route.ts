import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

function fmtUSD(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const fecha = url.searchParams.get("fecha");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }

  const sb = createServerClient();

  // Leads cuya fecha_agendado CAE en el día (agendas nuevas que "llegaron" para ese día)
  const { data: agendadasRaw } = await sb
    .from("leads")
    .select("id, nombre, estado, setter_id, closer_id, utm_source, utm_medium, ticket_total, fecha_agendado, fecha_llamada")
    .gte("fecha_agendado", `${fecha}T00:00:00`)
    .lte("fecha_agendado", `${fecha}T23:59:59`);

  // Leads con llamada programada ese día (llamadas que había)
  const { data: llamadasRaw } = await sb
    .from("leads")
    .select("id, nombre, estado, setter_id, closer_id, utm_source, utm_medium, ticket_total, fecha_llamada")
    .gte("fecha_llamada", `${fecha}T00:00:00`)
    .lte("fecha_llamada", `${fecha}T23:59:59`);

  // Payments del día
  const { data: payments } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor")
    .eq("estado", "pagado")
    .gte("fecha_pago", fecha)
    .lte("fecha_pago", fecha);

  // Team
  const { data: team } = await sb
    .from("team_members")
    .select("id, nombre, is_setter, is_closer");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre] as const));

  // UTM campaigns para mapear utm_medium → setter
  const { data: campaigns } = await sb
    .from("utm_campaigns")
    .select("medium, setter_id");
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns || []) {
    if (c.setter_id && c.medium) mediumToSetter.set(String(c.medium).toLowerCase(), c.setter_id);
  }

  const agendadas = agendadasRaw || [];
  const llamadas = llamadasRaw || [];

  // Llamadas tomadas = estado ≠ pendiente/cancelada/no_show/reprogramada
  const notTaken = new Set(["pendiente", "cancelada", "no_show", "reprogramada"]);
  const tomadas = llamadas.filter((l) => !notTaken.has(l.estado));
  const cerradas = llamadas.filter((l) =>
    l.estado === "cerrado" || l.estado === "adentro_seguimiento"
  );

  const cashDia = (payments || []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);

  // Resolver setter por lead (setter_id directo o fallback utm_medium)
  function resolveSetter(l: { setter_id: string | null; utm_medium: string | null }): string | null {
    if (l.setter_id) return l.setter_id;
    if (l.utm_medium) return mediumToSetter.get(l.utm_medium.toLowerCase()) || null;
    return null;
  }

  // Breakdown por setter (agendas nuevas del día)
  const agendasBySetter = new Map<string, number>();
  for (const l of agendadas) {
    const sid = resolveSetter(l);
    const key = sid ? teamById.get(sid) || "¿?" : "sin_setter";
    agendasBySetter.set(key, (agendasBySetter.get(key) || 0) + 1);
  }

  // Breakdown por fuente (utm_source) de las agendas
  const agendasBySource = new Map<string, number>();
  for (const l of agendadas) {
    const src = (l.utm_source || "sin_utm").toLowerCase();
    agendasBySource.set(src, (agendasBySource.get(src) || 0) + 1);
  }

  // Breakdown por closer (cerradas)
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

  // Formatear fecha bonita (DD/MM/YYYY)
  const [y, m, d] = fecha.split("-");
  const fechaBonita = `${d}/${m}/${y}`;

  // Construir texto
  const lines: string[] = [];
  lines.push(`📊 *REPORTE DIARIO — ${fechaBonita}*`);
  lines.push("");
  lines.push(`📅 *Agendas nuevas:* ${agendadas.length}`);
  if (agendasBySetter.size > 0) {
    const arr = [...agendasBySetter.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, n] of arr) lines.push(`   • ${name}: ${n}`);
  }
  lines.push("");
  lines.push(`📞 *Llamadas programadas:* ${llamadas.length}`);
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
  lines.push(`💵 *Cash cobrado:* ${fmtUSD(cashDia)} (${payments?.length || 0} pagos)`);
  if (cashByReceptor.size > 0) {
    const arr = [...cashByReceptor.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, usd] of arr) lines.push(`   • ${name}: ${fmtUSD(usd)}`);
  }
  if (agendasBySource.size > 0) {
    lines.push("");
    lines.push(`🎯 *Agendas por fuente:*`);
    const arr = [...agendasBySource.entries()].sort((a, b) => b[1] - a[1]);
    for (const [src, n] of arr) lines.push(`   • ${src}: ${n}`);
  }

  return NextResponse.json({ text: lines.join("\n") });
}
