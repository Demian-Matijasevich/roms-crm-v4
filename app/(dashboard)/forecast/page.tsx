import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getSettings } from "@/lib/queries/settings";
import { getFiscalStart, getFiscalEnd, toDateString, getToday } from "@/lib/date-utils";
import { forecastByMonth, projectThisMonth, scoreCuotaRiesgo, type PaymentLite } from "@/lib/forecast";
import ForecastClient from "./ForecastClient";

export const dynamic = "force-dynamic";

export interface ForecastSnapshot {
  thisMonth: ReturnType<typeof projectThisMonth>;
  threeMonths: ReturnType<typeof forecastByMonth>;
  meta_cash_mensual_usd: number;
  meta_ventas_mensual: number;
  ventas_mes: number;
  aov_avg: number;
  cuotas_en_riesgo_detalle: Array<{
    id: string;
    lead_nombre: string;
    monto_usd: number;
    fecha_vencimiento: string | null;
    dias_vencido: number;
    score: string;
    proba_cobro: number;
    motivos: string[];
    snoozed_until: string | null;
    snooze_count: number;
    lead_id: string | null;
    telefono: string | null;
  }>;
  por_closer: Array<{
    closer_id: string;
    closer_nombre: string;
    cash_mes_real: number;
    cash_mes_proyectado: number;
    cierres_mes: number;
    aov: number;
  }>;
  fiscalStart: string;
  fiscalEnd: string;
}

export default async function ForecastPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const allowed = session.is_admin || session.is_jefe_ventas || session.roles.includes("jefe_ventas");
  if (!allowed) redirect("/");

  const sb = createServerClient();
  const today = getToday();
  const todayStr = toDateString(today);
  const fiscalStart = toDateString(getFiscalStart(today));
  const fiscalEnd = toDateString(getFiscalEnd(today));

  const [paymentsRes, leadsRes, closersRes, settingsRaw] = await Promise.all([
    sb
      .from("payments")
      .select("id, lead_id, client_id, numero_cuota, monto_usd, estado, fecha_pago, fecha_vencimiento, snoozed_until, snooze_count, es_renovacion")
      .range(0, 9999),
    sb.from("leads").select("id, nombre, telefono, closer_id, estado, ticket_total, fecha_llamada").range(0, 9999),
    sb.from("team_members").select("id, nombre").eq("is_closer", true).eq("activo", true),
    getSettings(),
  ]);

  const payments = (paymentsRes.data || []) as Array<PaymentLite & { es_renovacion?: boolean }>;
  const leads = (leadsRes.data || []) as Array<{
    id: string;
    nombre: string;
    telefono: string | null;
    closer_id: string | null;
    estado: string;
    ticket_total: number;
    fecha_llamada: string | null;
  }>;
  const closers = (closersRes.data || []) as { id: string; nombre: string }[];
  const leadById = new Map(leads.map((l) => [l.id, l]));

  // Histórico por lead
  const historicoPorLead = new Map<string, PaymentLite[]>();
  for (const p of payments) {
    if (!p.lead_id) continue;
    if (!historicoPorLead.has(p.lead_id)) historicoPorLead.set(p.lead_id, []);
    historicoPorLead.get(p.lead_id)!.push(p);
  }

  // Pendientes del MES vigente
  const cuotasPendientesMes = payments.filter(
    (p) =>
      p.estado === "pendiente" &&
      p.fecha_vencimiento &&
      p.fecha_vencimiento >= fiscalStart &&
      p.fecha_vencimiento <= fiscalEnd
  );
  const thisMonth = projectThisMonth(payments, cuotasPendientesMes, historicoPorLead, fiscalStart, fiscalEnd, todayStr);

  // Forecast 3 meses (mes actual + 2 siguientes)
  const pendientesTotal = payments.filter((p) => p.estado === "pendiente");
  const threeMonths = forecastByMonth(pendientesTotal, historicoPorLead, todayStr, 3);

  // Cuotas en riesgo (atrasadas o con score alto/medio) — listado completo
  const cuotasRiesgoRaw = pendientesTotal
    .map((p) => {
      const histo = historicoPorLead.get(p.lead_id || "") || [];
      const r = scoreCuotaRiesgo(p, histo, todayStr);
      const lead = p.lead_id ? leadById.get(p.lead_id) : null;
      const daysOverdue = p.fecha_vencimiento ? Math.max(0, Math.floor((new Date(todayStr).getTime() - new Date(p.fecha_vencimiento).getTime()) / 86400000)) : 0;
      return {
        id: p.id,
        lead_id: p.lead_id,
        lead_nombre: lead?.nombre || "(s/n)",
        telefono: lead?.telefono || null,
        monto_usd: Number(p.monto_usd || 0),
        fecha_vencimiento: p.fecha_vencimiento,
        dias_vencido: daysOverdue,
        score: r.score,
        proba_cobro: r.proba_cobro,
        motivos: r.motivos,
        snoozed_until: p.snoozed_until,
        snooze_count: p.snooze_count || 0,
      };
    })
    .filter((x) => x.score !== "ok")
    .sort((a, b) => a.proba_cobro - b.proba_cobro);

  // Settings (meta)
  const settings = settingsRaw as Record<string, unknown>;
  const meta_cash_mensual_usd = Number(settings.meta_cash_mensual_usd) || 0;
  const meta_ventas_mensual = Number(settings.meta_ventas_mensual) || 0;

  // Ventas del mes
  const ventasMes = leads.filter(
    (l) =>
      l.estado === "cerrado" &&
      l.fecha_llamada &&
      l.fecha_llamada.slice(0, 10) >= fiscalStart &&
      l.fecha_llamada.slice(0, 10) <= fiscalEnd
  ).length;
  const c1PagadasMes = payments.filter(
    (p) => p.numero_cuota === 1 && p.estado === "pagado" && p.fecha_pago && p.fecha_pago >= fiscalStart && p.fecha_pago <= fiscalEnd
  );
  const aovAvg = c1PagadasMes.length > 0 ? c1PagadasMes.reduce((s, p) => s + Number(p.monto_usd || 0), 0) / c1PagadasMes.length : 0;

  // Proyección por closer
  const por_closer = closers.map((c) => {
    const closerLeadIds = new Set(leads.filter((l) => l.closer_id === c.id).map((l) => l.id));
    const pagosCloser = payments.filter(
      (p) => p.lead_id && closerLeadIds.has(p.lead_id) && p.estado === "pagado" && p.fecha_pago && p.fecha_pago >= fiscalStart && p.fecha_pago <= fiscalEnd
    );
    const cashReal = pagosCloser.reduce((s, p) => s + Number(p.monto_usd || 0), 0);

    // Proyección: cash real + pendientes del mes ponderadas
    const pendientesCloser = cuotasPendientesMes.filter((p) => p.lead_id && closerLeadIds.has(p.lead_id));
    let proyectadoExtra = 0;
    for (const cuota of pendientesCloser) {
      const histo = historicoPorLead.get(cuota.lead_id || "") || [];
      const r = scoreCuotaRiesgo(cuota, histo, todayStr);
      proyectadoExtra += Number(cuota.monto_usd || 0) * r.proba_cobro;
    }
    const cierres = leads.filter(
      (l) => l.closer_id === c.id && l.estado === "cerrado" && l.fecha_llamada && l.fecha_llamada.slice(0, 10) >= fiscalStart && l.fecha_llamada.slice(0, 10) <= fiscalEnd
    ).length;
    return {
      closer_id: c.id,
      closer_nombre: c.nombre,
      cash_mes_real: Math.round(cashReal),
      cash_mes_proyectado: Math.round(cashReal + proyectadoExtra),
      cierres_mes: cierres,
      aov: cierres > 0 ? Math.round(cashReal / cierres) : 0,
    };
  });
  por_closer.sort((a, b) => b.cash_mes_proyectado - a.cash_mes_proyectado);

  const snapshot: ForecastSnapshot = {
    thisMonth,
    threeMonths,
    meta_cash_mensual_usd,
    meta_ventas_mensual,
    ventas_mes: ventasMes,
    aov_avg: Math.round(aovAvg),
    cuotas_en_riesgo_detalle: cuotasRiesgoRaw,
    por_closer,
    fiscalStart,
    fiscalEnd,
  };

  return <ForecastClient snapshot={snapshot} session={session} />;
}
