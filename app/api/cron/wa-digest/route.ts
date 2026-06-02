import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString, getToday } from "@/lib/date-utils";

/**
 * GET /api/cron/wa-digest
 *
 * Arma el mensaje WA del día con leads para apurar, cuotas en riesgo,
 * etc. Si está configurado Evolution API y EVOLUTION_API_TARGET_PHONE,
 * lo manda. Sino devuelve el texto para que un humano lo copie.
 *
 * Variables esperadas (opcionales, si faltan solo devuelve el texto):
 *   EVOLUTION_API_URL   — endpoint base
 *   EVOLUTION_API_KEY   — API key
 *   EVOLUTION_INSTANCE  — nombre de instancia
 *   EVOLUTION_DIGEST_TARGET — número destino (con país, ej 5491100001111)
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && secret !== "dev-secret") {
    return NextResponse.json({ error: "auth requerida" }, { status: 401 });
  }

  const sb = createServerClient();
  const today = getToday();
  const todayStr = toDateString(today);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // ── Reservas vencidas ──
  const { data: reservasVencidas } = await sb
    .from("leads")
    .select("id, nombre, fecha_cierre_estimada, ticket_total, closer:team_members!leads_closer_id_fkey(nombre)")
    .eq("estado", "reserva")
    .lt("fecha_cierre_estimada", todayStr)
    .range(0, 50);

  // ── Leads fríos 7d+ ──
  const { data: fríos } = await sb
    .from("leads")
    .select("id, nombre, fecha_llamada, closer:team_members!leads_closer_id_fkey(nombre)")
    .in("estado", ["seguimiento", "reserva", "no_show"])
    .lt("fecha_llamada", sevenDaysAgo)
    .range(0, 50);

  // ── Cuotas vencidas hace +3d ──
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const { data: cuotasAtrasadas } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_vencimiento, lead:leads(nombre)")
    .eq("estado", "pendiente")
    .lt("fecha_vencimiento", threeDaysAgo)
    .order("fecha_vencimiento", { ascending: true })
    .range(0, 30);

  // ── Cierres del día anterior ──
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { data: cierresAyer } = await sb
    .from("leads")
    .select("id, nombre, ticket_total, closer:team_members!leads_closer_id_fkey(nombre)")
    .eq("estado", "cerrado")
    .gte("fecha_llamada", yesterdayStr)
    .lt("fecha_llamada", todayStr)
    .range(0, 30);

  const lines: string[] = [];
  const fmt = (n: number) => "$" + Math.round(Number(n || 0)).toLocaleString("es-AR");
  const cl = (c: unknown) => {
    if (Array.isArray(c)) return (c[0] as { nombre?: string })?.nombre || "—";
    return (c as { nombre?: string } | null)?.nombre || "—";
  };

  lines.push(`*📊 Daily Digest ROMS — ${todayStr}*`);
  lines.push("");

  if ((cierresAyer || []).length > 0) {
    lines.push(`*🎉 Cierres de ayer (${cierresAyer!.length})*`);
    for (const l of cierresAyer!) {
      lines.push(`• ${l.nombre} — ${fmt(l.ticket_total)} (${cl(l.closer)})`);
    }
    lines.push("");
  }

  if ((reservasVencidas || []).length > 0) {
    lines.push(`*⚠️ Reservas vencidas (${reservasVencidas!.length})* — apurar HOY`);
    for (const l of reservasVencidas!.slice(0, 10)) {
      lines.push(`• ${l.nombre} (${cl(l.closer)}) — venc. ${l.fecha_cierre_estimada} · ${fmt(l.ticket_total)}`);
    }
    if (reservasVencidas!.length > 10) lines.push(`  + ${reservasVencidas!.length - 10} más`);
    lines.push("");
  }

  if ((cuotasAtrasadas || []).length > 0) {
    lines.push(`*⏰ Cuotas atrasadas +3d (${cuotasAtrasadas!.length})*`);
    let total = 0;
    for (const c of cuotasAtrasadas!.slice(0, 10)) {
      total += Number(c.monto_usd);
      const nom = (c.lead as { nombre?: string } | null)?.nombre || "(s/n)";
      lines.push(`• ${nom} — ${fmt(c.monto_usd)} venc. ${c.fecha_vencimiento}`);
    }
    if (cuotasAtrasadas!.length > 10) lines.push(`  + ${cuotasAtrasadas!.length - 10} más`);
    lines.push(`  Total: ${fmt(cuotasAtrasadas!.reduce((s, c) => s + Number(c.monto_usd), 0))}`);
    lines.push("");
  }

  if ((fríos || []).length > 0) {
    lines.push(`*🥶 Leads fríos 7d+ (${fríos!.length})* — reactivar conversación`);
    for (const l of fríos!.slice(0, 10)) {
      lines.push(`• ${l.nombre} (${cl(l.closer)})`);
    }
    if (fríos!.length > 10) lines.push(`  + ${fríos!.length - 10} más`);
    lines.push("");
  }

  if (lines.length <= 2) {
    lines.push("🎉 Todo en orden — sin alertas para hoy");
  }

  const mensaje = lines.join("\n");

  // Intentar enviar a Evolution API si está configurado
  const evolUrl = process.env.EVOLUTION_API_URL;
  const evolKey = process.env.EVOLUTION_API_KEY;
  const evolInstance = process.env.EVOLUTION_INSTANCE;
  const evolTarget = process.env.EVOLUTION_DIGEST_TARGET;

  let sent = false;
  let sendError: string | null = null;
  if (evolUrl && evolKey && evolInstance && evolTarget) {
    try {
      const sendRes = await fetch(`${evolUrl}/message/sendText/${evolInstance}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolKey,
        },
        body: JSON.stringify({ number: evolTarget, text: mensaje }),
      });
      sent = sendRes.ok;
      if (!sendRes.ok) sendError = `Evolution API HTTP ${sendRes.status}`;
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    ok: true,
    mensaje,
    sent,
    sendError,
    targets_configured: !!(evolUrl && evolKey && evolInstance && evolTarget),
  });
}
