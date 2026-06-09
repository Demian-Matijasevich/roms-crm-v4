/**
 * GET /api/cron/eod-report?token=XXX&date=YYYY-MM-DD&target=phone
 *
 * Genera el reporte EOD del día y lo envía por WhatsApp (Evolution API)
 * al grupo EOD o al número de test.
 *
 * Para cada closer activo:
 *   - Llamadas agendadas hoy
 *   - Show ups vs no shows
 *   - Cerrados + cash collected del día
 *   - En seguimiento / reprogramadas
 *   - Próximas agendas mañana
 *
 * ENV vars requeridas:
 *   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
 *   EOD_CRON_TOKEN (auth simple para que n8n pueda invocarlo)
 *   EOD_TARGET_NUMBER (default; podés override con ?target=)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const expectedToken = process.env.EOD_CRON_TOKEN || "";
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  // Fecha objetivo: default hoy en São Paulo (UTC-3)
  const targetDate = url.searchParams.get("date") || (() => {
    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    return sp.toISOString().slice(0, 10);
  })();

  // Día siguiente para "Mañana"
  const tomorrow = (() => {
    const d = new Date(targetDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const sb = createServerClient();

  // Todos los closers activos
  const { data: closers } = await sb
    .from("team_members")
    .select("id, nombre")
    .eq("activo", true)
    .eq("is_closer", true)
    .order("nombre");

  // Leads del día (agendado o llamada hoy) — para todos
  const { data: todayLeads } = await sb
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, se_presento, closer_id, ticket_total, programa_pitcheado")
    .or(`fecha_llamada.eq.${targetDate},fecha_agendado.eq.${targetDate}`)
    .range(0, 9999);

  // Leads agendados para mañana
  const { data: tomorrowLeads } = await sb
    .from("leads")
    .select("id, nombre, closer_id, fecha_agendado")
    .or(`fecha_llamada.eq.${tomorrow},fecha_agendado.eq.${tomorrow}`)
    .range(0, 9999);

  // Cash collected del día (payments pagados con fecha_pago=hoy, cuota 1 (deals nuevos))
  const { data: payments } = await sb
    .from("payments")
    .select("monto_usd, lead_id, fecha_pago, estado, numero_cuota")
    .eq("fecha_pago", targetDate)
    .eq("estado", "pagado")
    .range(0, 999);

  const cashByLead = new Map<string, number>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    cashByLead.set(p.lead_id, (cashByLead.get(p.lead_id) || 0) + Number(p.monto_usd || 0));
  }

  // Armado del reporte por closer
  const reporteCloser: Array<{ nombre: string; stats: Record<string, number>; cerrados: string[]; cash: number; manana: number }> = [];

  for (const c of closers || []) {
    const míos = (todayLeads || []).filter((l) => l.closer_id === c.id);
    if (míos.length === 0) continue;

    const stats: Record<string, number> = {
      agendados: míos.length,
      show: míos.filter((l) => l.se_presento === "si").length,
      noShow: míos.filter((l) => l.se_presento === "no" || l.estado === "no_show").length,
      cancelados: míos.filter((l) => l.estado === "cancelada" || l.se_presento === "cancelado").length,
      cerrados: míos.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento").length,
      reservas: míos.filter((l) => l.estado === "reserva").length,
      seguimiento: míos.filter((l) => l.estado === "seguimiento").length,
      no_cierre: míos.filter((l) => l.estado === "no_cierre" || l.estado === "no_calificado" || l.estado === "broke_cancelado").length,
      pendientes: míos.filter((l) => l.estado === "pendiente").length,
    };

    const cerrados = míos
      .filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva")
      .map((l) => `${l.nombre || "—"} (${l.programa_pitcheado || "—"}, $${Number(l.ticket_total || 0).toLocaleString("en-US")})`);

    const cash = míos.reduce((s, l) => s + (cashByLead.get(l.id) || 0), 0);
    const manana = (tomorrowLeads || []).filter((l) => l.closer_id === c.id).length;

    reporteCloser.push({ nombre: c.nombre, stats, cerrados, cash, manana });
  }

  // Totales globales
  const globalAgendados = reporteCloser.reduce((s, r) => s + r.stats.agendados, 0);
  const globalShow = reporteCloser.reduce((s, r) => s + r.stats.show, 0);
  const globalCerrados = reporteCloser.reduce((s, r) => s + r.stats.cerrados + r.stats.reservas, 0);
  const globalCash = reporteCloser.reduce((s, r) => s + r.cash, 0);
  const globalManana = reporteCloser.reduce((s, r) => s + r.manana, 0);

  // Armar mensaje WhatsApp
  const fechaLabel = new Date(targetDate + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const lines: string[] = [
    `📊 *EOD — ${fechaLabel.charAt(0).toUpperCase() + fechaLabel.slice(1)}*`,
    ``,
    `🎯 *Resumen del día*`,
    `• Agendadas: ${globalAgendados}`,
    `• Show ups: ${globalShow}/${globalAgendados}${globalAgendados > 0 ? ` (${Math.round((globalShow / globalAgendados) * 100)}%)` : ""}`,
    `• Cerrados: ${globalCerrados}`,
    `• Cash collected: $${Math.round(globalCash).toLocaleString("en-US")}`,
    `• Para mañana: ${globalManana} agendas`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];

  for (const r of reporteCloser) {
    lines.push("");
    lines.push(`👤 *${r.nombre}* — ${r.stats.agendados} llamada${r.stats.agendados === 1 ? "" : "s"}`);
    lines.push(`✅ Show: ${r.stats.show}  ❌ No show: ${r.stats.noShow}`);
    lines.push(`💰 Cerrados: ${r.stats.cerrados + r.stats.reservas}  💵 Cash: $${Math.round(r.cash).toLocaleString("en-US")}`);
    if (r.cerrados.length > 0) {
      for (const c of r.cerrados) lines.push(`   • ${c}`);
    }
    if (r.stats.seguimiento > 0) lines.push(`⏰ Seguimiento: ${r.stats.seguimiento}`);
    if (r.stats.no_cierre > 0) lines.push(`🚫 No cierre: ${r.stats.no_cierre}`);
    if (r.stats.pendientes > 0) lines.push(`⚠️ Pendientes de marcar: ${r.stats.pendientes}`);
    if (r.manana > 0) lines.push(`📅 Mañana: ${r.manana} llamada${r.manana === 1 ? "" : "s"}`);
  }

  if (reporteCloser.length === 0) {
    lines.push("");
    lines.push("_Sin llamadas registradas hoy._");
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("🤖 Reporte automático ROMS CRM");

  const mensaje = lines.join("\n");

  // Enviar via Evolution API
  const evolUrl = process.env.EVOLUTION_API_URL;
  const evolKey = process.env.EVOLUTION_API_KEY;
  const evolInstance = process.env.EVOLUTION_INSTANCE;
  const target = url.searchParams.get("target") || process.env.EOD_TARGET_NUMBER || "";

  let sentStatus: number | null = null;
  let sendError: string | null = null;

  if (!evolUrl || !evolKey || !evolInstance) {
    sendError = "Evolution API no configurado (faltan ENV vars)";
  } else if (!target) {
    sendError = "Falta EOD_TARGET_NUMBER o ?target=";
  } else {
    try {
      const sendRes = await fetch(`${evolUrl}/message/sendText/${encodeURIComponent(evolInstance)}`, {
        method: "POST",
        headers: {
          apikey: evolKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: target, text: mensaje }),
      });
      sentStatus = sendRes.status;
      if (!sendRes.ok) {
        const txt = await sendRes.text().catch(() => "");
        sendError = `Evolution HTTP ${sendRes.status}: ${txt.slice(0, 200)}`;
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: !sendError,
    date: targetDate,
    target,
    closers_con_actividad: reporteCloser.length,
    globalCerrados,
    globalCash,
    sentStatus,
    sendError,
    mensaje,
  });
}
