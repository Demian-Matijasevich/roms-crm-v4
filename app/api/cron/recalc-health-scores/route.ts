import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { computeHealthScore } from "@/lib/health-score";

/**
 * GET /api/cron/recalc-health-scores
 * Recalcula health_score_auto para TODOS los clientes activos/pausados.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "auth requerida" }, { status: 401 });
  }

  const sb = createServerClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: clients } = await sb
    .from("clients")
    .select("id, lead_id, estado, fecha_onboarding, fecha_ultimo_seguimiento")
    .in("estado", ["activo", "pausado", "no_termino_pagar"])
    .range(0, 9999);

  let updated = 0;
  for (const c of clients || []) {
    // Días sin contacto: usar fecha_ultimo_seguimiento si existe, sino la fecha más reciente entre pagos
    let diasSinContacto = 999;
    if (c.fecha_ultimo_seguimiento) {
      diasSinContacto = Math.floor((Date.now() - new Date(c.fecha_ultimo_seguimiento).getTime()) / 86400000);
    } else if (c.lead_id) {
      const { data: lastPay } = await sb
        .from("payments")
        .select("fecha_pago")
        .eq("lead_id", c.lead_id)
        .eq("estado", "pagado")
        .not("fecha_pago", "is", null)
        .order("fecha_pago", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastPay?.fecha_pago) {
        diasSinContacto = Math.floor((Date.now() - new Date(lastPay.fecha_pago).getTime()) / 86400000);
      }
    }

    // Cuotas atrasadas
    let cuotasAtrasadasCount = 0;
    let cuotasAtrasadasTotal = 0;
    if (c.lead_id) {
      const { data: cuotasAtras } = await sb
        .from("payments")
        .select("monto_usd")
        .eq("lead_id", c.lead_id)
        .eq("estado", "pendiente")
        .lt("fecha_vencimiento", todayStr);
      cuotasAtrasadasCount = cuotasAtras?.length || 0;
      cuotasAtrasadasTotal = (cuotasAtras || []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    }

    // Ticket total del lead
    let ticketTotal = 0;
    if (c.lead_id) {
      const { data: lead } = await sb.from("leads").select("ticket_total").eq("id", c.lead_id).maybeSingle();
      ticketTotal = Number(lead?.ticket_total || 0);
    }

    const diasOnb = c.fecha_onboarding
      ? Math.floor((Date.now() - new Date(c.fecha_onboarding).getTime()) / 86400000)
      : 999;

    const r = computeHealthScore({
      dias_sin_contacto: diasSinContacto,
      cuotas_atrasadas_count: cuotasAtrasadasCount,
      cuotas_atrasadas_total_usd: cuotasAtrasadasTotal,
      ticket_total: ticketTotal,
      estado: c.estado,
      dias_desde_onboarding: diasOnb,
    });

    await sb.from("clients").update({
      health_score_auto: r.score,
      dias_sin_contacto: diasSinContacto > 999 ? null : diasSinContacto,
    }).eq("id", c.id);
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
