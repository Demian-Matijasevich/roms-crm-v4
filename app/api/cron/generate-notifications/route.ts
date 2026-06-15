import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { createNotification, createNotificationsForAdmins } from "@/lib/notifications";
import { getToday, toDateString } from "@/lib/date-utils";

/**
 * GET /api/cron/generate-notifications
 *
 * Genera notificaciones in-app y devuelve resumen.
 * Diseñado para ser llamado desde un cron (Vercel cron, GitHub Actions, etc).
 *
 * Lógica:
 *   • Lead frío 7d+ → notif al closer (1 vez por lead, no spammear)
 *   • Reserva vencida → notif al closer (idem)
 *   • Cuota en riesgo alto → notif a admins (1 por cuota por día max)
 *   • Refund nuevo → notif a admins
 *
 * Auth: requiere header X-Cron-Secret igual a env.CRON_SECRET, sino 401.
 */
export async function GET(req: NextRequest) {
  // Auth simple para cron
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "auth requerida" }, { status: 401 });
  }

  const sb = createServerClient();
  // YYYY-MM-DD ART, no UTC. Sino el cron a 00:30 UTC (21:30 ART) reporta
  // del día siguiente y dispara notifs 3hs temprano.
  const todayStr = toDateString(getToday());
  const sevenDaysAgo = (() => {
    const d = getToday();
    d.setDate(d.getDate() - 7);
    return toDateString(d);
  })();

  let count_lead_frio = 0;
  let count_reserva_vencida = 0;
  let count_cuota_riesgo = 0;
  let count_refund = 0;

  // ── 1. Leads fríos 7d+ asignados a closer ──
  const { data: leadsFrios } = await sb
    .from("leads")
    .select("id, nombre, closer_id, fecha_llamada")
    .in("estado", ["seguimiento", "reserva", "no_show", "reprogramada"])
    .lt("fecha_llamada", sevenDaysAgo)
    .not("closer_id", "is", null)
    .range(0, 999);

  for (const lead of leadsFrios || []) {
    // Anti-spam: no crear si ya existe una notif del mismo tipo y lead en últimas 7d
    const { data: existing } = await sb
      .from("notifications")
      .select("id")
      .eq("recipient_id", lead.closer_id!)
      .eq("tipo", "lead_frio")
      .gte("created_at", sevenDaysAgo)
      .contains("meta", { lead_id: lead.id })
      .limit(1);
    if (existing && existing.length > 0) continue;
    const r = await createNotification({
      recipient_id: lead.closer_id!,
      tipo: "lead_frio",
      titulo: `${lead.nombre} sin movimiento 7d+`,
      mensaje: "Reactivar conversación para no perder el lead",
      link: `/llamadas/${lead.id}/estado-cuenta`,
      meta: { lead_id: lead.id },
    });
    if (r.ok) count_lead_frio++;
  }

  // ── 2. Reservas vencidas (fecha_cierre_estimada < hoy) ──
  const { data: reservasVencidas } = await sb
    .from("leads")
    .select("id, nombre, closer_id, fecha_cierre_estimada")
    .eq("estado", "reserva")
    .lt("fecha_cierre_estimada", todayStr)
    .not("closer_id", "is", null)
    .range(0, 999);

  for (const lead of reservasVencidas || []) {
    const { data: existing } = await sb
      .from("notifications")
      .select("id")
      .eq("recipient_id", lead.closer_id!)
      .eq("tipo", "apure")
      .gte("created_at", sevenDaysAgo)
      .contains("meta", { lead_id: lead.id })
      .limit(1);
    if (existing && existing.length > 0) continue;
    const r = await createNotification({
      recipient_id: lead.closer_id!,
      tipo: "apure",
      titulo: `Reserva vencida: ${lead.nombre}`,
      mensaje: `Fecha estimada de cierre fue ${lead.fecha_cierre_estimada}`,
      link: `/llamadas/${lead.id}/estado-cuenta`,
      meta: { lead_id: lead.id },
    });
    if (r.ok) count_reserva_vencida++;
  }

  // ── 3. Cuotas en riesgo alto (vencidas hace +7d sin pagar) ──
  const { data: cuotasRiesgo } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_vencimiento, lead:leads(nombre)")
    .eq("estado", "pendiente")
    .lt("fecha_vencimiento", sevenDaysAgo)
    .range(0, 199);

  for (const cuota of cuotasRiesgo || []) {
    const { data: existing } = await sb
      .from("notifications")
      .select("id")
      .eq("tipo", "cuota_riesgo")
      .gte("created_at", sevenDaysAgo)
      .contains("meta", { payment_id: cuota.id })
      .limit(1);
    if (existing && existing.length > 0) continue;
    const nombre = (cuota.lead as { nombre?: string } | null)?.nombre || "(s/n)";
    const cnt = await createNotificationsForAdmins({
      tipo: "cuota_riesgo",
      titulo: `Cuota en riesgo: ${nombre}`,
      mensaje: `$${cuota.monto_usd} vencida desde ${cuota.fecha_vencimiento}`,
      link: cuota.lead_id ? `/llamadas/${cuota.lead_id}/estado-cuenta` : "/cobranzas",
      meta: { payment_id: cuota.id, lead_id: cuota.lead_id },
    });
    count_cuota_riesgo += cnt;
  }

  // ── 4. Refunds nuevos (creados últimas 24h) ──
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const { data: refundsNuevos } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, lead:leads(nombre)")
    .eq("estado", "refund")
    .gte("created_at", yesterday)
    .range(0, 50);

  for (const r of refundsNuevos || []) {
    const { data: existing } = await sb
      .from("notifications")
      .select("id")
      .eq("tipo", "refund")
      .contains("meta", { payment_id: r.id })
      .limit(1);
    if (existing && existing.length > 0) continue;
    const nombre = (r.lead as { nombre?: string } | null)?.nombre || "(s/n)";
    const cnt = await createNotificationsForAdmins({
      tipo: "refund",
      titulo: `Refund nuevo: ${nombre}`,
      mensaje: `$${r.monto_usd} devuelto el ${r.fecha_pago}`,
      link: r.lead_id ? `/llamadas/${r.lead_id}/estado-cuenta` : "/finanzas",
      meta: { payment_id: r.id, lead_id: r.lead_id },
    });
    count_refund += cnt;
  }

  return NextResponse.json({
    ok: true,
    created: {
      lead_frio: count_lead_frio,
      reserva_vencida: count_reserva_vencida,
      cuota_riesgo: count_cuota_riesgo,
      refund: count_refund,
    },
  });
}
