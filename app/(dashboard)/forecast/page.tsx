import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getSettings } from "@/lib/queries/settings";
import { getNichoFilter } from "@/lib/vista";
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
    // E2 - forecast 30d de comisiones
    com_30d_estimada: number;
    cash_30d_estimado: number;
  }>;
  // E1 - histórico mes a mes
  historico: Array<{
    ym: string;
    label: string;
    cash_total: number;
    cuotas_vencieron: number;
    cuotas_cobradas: number;
    pct_cobro: number;
    refunds: number;
  }>;
  // E3 - burn rate
  gastos_mes: number;
  cash_mes_proyectado: number;
  burn_rate_status: "ok" | "warning" | "critical";
  // E4 - score salud financiera
  salud_financiera: {
    score: number;
    level: string;
    refunds_pct: number;
    atrasadas_pct: number;
    gastos_vs_ingresos_pct: number;
    motivos: string[];
  };
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
  const nicho = await getNichoFilter();

  // Leads filtrados por nicho si corresponde
  let leadsQuery = sb.from("leads").select("id, nombre, telefono, closer_id, estado, ticket_total, fecha_llamada").range(0, 9999);
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  const [paymentsRes, leadsRes, closersRes, settingsRaw] = await Promise.all([
    sb
      .from("payments")
      .select("id, lead_id, client_id, numero_cuota, monto_usd, estado, fecha_pago, fecha_vencimiento, snoozed_until, snooze_count, es_renovacion")
      .range(0, 9999),
    leadsQuery,
    sb.from("team_members").select("id, nombre").eq("is_closer", true).eq("activo", true),
    getSettings(),
  ]);

  const allPaymentsRaw = (paymentsRes.data || []) as Array<PaymentLite & { es_renovacion?: boolean }>;
  const leads = (leadsRes.data || []) as Array<{
    id: string;
    nombre: string;
    telefono: string | null;
    closer_id: string | null;
    estado: string;
    ticket_total: number;
    fecha_llamada: string | null;
  }>;
  // Si hay filtro de nicho, recortar payments a los leads del nicho
  const leadIdsNicho = nicho ? new Set(leads.map((l) => l.id)) : null;
  const payments = leadIdsNicho
    ? allPaymentsRaw.filter((p) => !p.lead_id || leadIdsNicho.has(p.lead_id))
    : allPaymentsRaw;
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

  // Forecast 30 días: cuotas con venc en 30d × proba × % de comisión efectivo
  const in30Date = new Date();
  in30Date.setDate(in30Date.getDate() + 30);
  const in30Str = in30Date.toISOString().slice(0, 10);

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

    // E2: forecast 30d — cuotas próximas a vencer + reservas que probablemente cierren
    const cuotas30d = payments.filter(
      (p) => p.lead_id && closerLeadIds.has(p.lead_id) && p.estado === "pendiente" && p.fecha_vencimiento && p.fecha_vencimiento >= todayStr && p.fecha_vencimiento <= in30Str
    );
    let cash30dEst = 0;
    for (const cuota of cuotas30d) {
      const histo = historicoPorLead.get(cuota.lead_id || "") || [];
      const r = scoreCuotaRiesgo(cuota, histo, todayStr);
      cash30dEst += Number(cuota.monto_usd || 0) * r.proba_cobro;
    }
    // Comisión estimada 30d: 7% promedio del cash30d
    const com30dEst = cash30dEst * 0.07;

    return {
      closer_id: c.id,
      closer_nombre: c.nombre,
      cash_mes_real: Math.round(cashReal),
      cash_mes_proyectado: Math.round(cashReal + proyectadoExtra),
      cierres_mes: cierres,
      aov: cierres > 0 ? Math.round(cashReal / cierres) : 0,
      com_30d_estimada: Math.round(com30dEst),
      cash_30d_estimado: Math.round(cash30dEst),
    };
  });
  por_closer.sort((a, b) => b.cash_mes_proyectado - a.cash_mes_proyectado);

  // ── E1: HISTÓRICO mes a mes (últimos 6 meses) ──
  const historico: Array<{ ym: string; label: string; cash_total: number; cuotas_vencieron: number; cuotas_cobradas: number; pct_cobro: number; refunds: number }> = [];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const startM = `${ym}-01`;
    const endM = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

    const cashM = payments
      .filter((p) => p.estado === "pagado" && p.fecha_pago && p.fecha_pago >= startM && p.fecha_pago <= endM)
      .reduce((s, p) => s + Number(p.monto_usd || 0), 0);

    // Cuotas que vencieron en ese mes
    const venciendo = payments.filter((p) => p.fecha_vencimiento && p.fecha_vencimiento >= startM && p.fecha_vencimiento <= endM);
    const cobradasDeEsasCuotas = venciendo.filter((p) => p.estado === "pagado").length;
    const totalVenciendo = venciendo.length;
    const pctCobro = totalVenciendo > 0 ? (cobradasDeEsasCuotas / totalVenciendo) * 100 : 0;

    const refundsM = payments
      .filter((p) => p.estado === "refund" && p.fecha_pago && p.fecha_pago >= startM && p.fecha_pago <= endM)
      .reduce((s, p) => s + Number(p.monto_usd || 0), 0);

    historico.push({
      ym,
      label: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
      cash_total: Math.round(cashM),
      cuotas_vencieron: totalVenciendo,
      cuotas_cobradas: cobradasDeEsasCuotas,
      pct_cobro: Math.round(pctCobro),
      refunds: Math.round(refundsM),
    });
  }

  // ── E3: BURN RATE — gastos del mes ──
  const { data: gastosMesRes } = await sb
    .from("gastos")
    .select("monto_usd")
    .gte("fecha", fiscalStart)
    .lte("fecha", fiscalEnd);
  const gastos_mes = (gastosMesRes || []).reduce((s, g) => s + Number(g.monto_usd || 0), 0);
  const cash_mes_proyectado = thisMonth.proyectado_total;
  let burn_rate_status: "ok" | "warning" | "critical" = "ok";
  if (gastos_mes > cash_mes_proyectado) burn_rate_status = "critical";
  else if (gastos_mes > cash_mes_proyectado * 0.75) burn_rate_status = "warning";

  // ── E4: SCORE SALUD FINANCIERA ──
  const refundsMonth = payments
    .filter((p) => p.estado === "refund" && p.fecha_pago && p.fecha_pago >= fiscalStart && p.fecha_pago <= fiscalEnd)
    .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const totalCashMes = thisMonth.ya_cobrado;
  const refundsPct = totalCashMes > 0 ? (refundsMonth / totalCashMes) * 100 : 0;
  const atrasadasCount = payments.filter((p) => p.estado === "pendiente" && p.fecha_vencimiento && p.fecha_vencimiento < todayStr).length;
  const pendientesActivos = payments.filter((p) => p.estado === "pendiente").length;
  const atrasadasPct = pendientesActivos > 0 ? (atrasadasCount / pendientesActivos) * 100 : 0;
  const gastosVsIngresosPct = cash_mes_proyectado > 0 ? (gastos_mes / cash_mes_proyectado) * 100 : 0;

  let score = 100;
  const motivosSalud: string[] = [];
  if (refundsPct > 8) { score -= 20; motivosSalud.push(`refunds ${refundsPct.toFixed(1)}% del cash (alto)`); }
  else if (refundsPct > 4) { score -= 8; motivosSalud.push(`refunds ${refundsPct.toFixed(1)}%`); }
  if (atrasadasPct > 30) { score -= 25; motivosSalud.push(`${atrasadasPct.toFixed(0)}% cuotas atrasadas`); }
  else if (atrasadasPct > 15) { score -= 12; motivosSalud.push(`${atrasadasPct.toFixed(0)}% cuotas atrasadas`); }
  if (gastosVsIngresosPct > 80) { score -= 20; motivosSalud.push(`gastos ${gastosVsIngresosPct.toFixed(0)}% del cash`); }
  else if (gastosVsIngresosPct > 60) { score -= 8; motivosSalud.push(`gastos ${gastosVsIngresosPct.toFixed(0)}% del cash`); }
  if (cuotasRiesgoRaw.filter((r) => r.score === "alto").length > 5) {
    score -= 10;
    motivosSalud.push(`${cuotasRiesgoRaw.filter((r) => r.score === "alto").length} cuotas en riesgo alto`);
  }
  score = Math.max(0, Math.min(100, score));
  const level = score >= 80 ? "saludable" : score >= 60 ? "atencion" : score >= 40 ? "alerta" : "critico";

  const snapshot: ForecastSnapshot = {
    thisMonth,
    threeMonths,
    meta_cash_mensual_usd,
    meta_ventas_mensual,
    ventas_mes: ventasMes,
    aov_avg: Math.round(aovAvg),
    cuotas_en_riesgo_detalle: cuotasRiesgoRaw,
    por_closer,
    historico,
    gastos_mes: Math.round(gastos_mes),
    cash_mes_proyectado,
    burn_rate_status,
    salud_financiera: {
      score: Math.round(score),
      level,
      refunds_pct: Math.round(refundsPct * 10) / 10,
      atrasadas_pct: Math.round(atrasadasPct),
      gastos_vs_ingresos_pct: Math.round(gastosVsIngresosPct),
      motivos: motivosSalud,
    },
    fiscalStart,
    fiscalEnd,
  };

  return <ForecastClient snapshot={snapshot} session={session} />;
}
