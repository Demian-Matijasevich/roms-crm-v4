/**
 * Helpers de proyección (forecast) y score de cobrabilidad de cuotas.
 * Server-friendly: solo lógica pura, sin imports de Supabase.
 */

export interface PaymentLite {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  numero_cuota: number;
  monto_usd: number;
  estado: string;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  snoozed_until: string | null;
  snooze_count: number;
}

export interface RiskAssessment {
  score: "alto" | "medio" | "bajo" | "ok";
  proba_cobro: number; // 0..1, probabilidad estimada de cobrar
  motivos: string[];
}

/**
 * Calcula score de riesgo de UNA cuota pendiente puntual.
 *
 * Inputs:
 *   - cuota actual (pending)
 *   - histórico de todas las cuotas del MISMO lead/cliente (cobradas + perdidas)
 *   - hoy (string YYYY-MM-DD)
 */
export function scoreCuotaRiesgo(
  cuota: PaymentLite,
  historico: PaymentLite[],
  todayStr: string
): RiskAssessment {
  const motivos: string[] = [];
  let proba = 0.85; // base optimista

  // Días vencido (referencia: fecha_estimada_pago si existe, sino fecha_vencimiento)
  const venc = cuota.fecha_vencimiento;
  if (venc) {
    const daysOverdue = daysBetween(venc, todayStr);
    if (daysOverdue > 0) {
      // Cada 7 días vencida → -10% proba
      const penalty = Math.min(0.6, Math.floor(daysOverdue / 7) * 0.1);
      proba -= penalty;
      motivos.push(`${daysOverdue}d vencida`);
    }
  }

  // Snooze history del cliente
  if (cuota.snooze_count > 0) {
    proba -= cuota.snooze_count * 0.07;
    motivos.push(`postergada ${cuota.snooze_count}x`);
  }

  // Historial del lead: cuotas previas pagadas a tiempo vs tarde
  const otrasPagadas = historico.filter((p) => p.estado === "pagado" && p.fecha_pago && p.fecha_vencimiento && p.id !== cuota.id);
  if (otrasPagadas.length > 0) {
    const atrasos = otrasPagadas.map((p) => daysBetween(p.fecha_vencimiento!, p.fecha_pago!));
    const atrasoAvg = atrasos.reduce((s, x) => s + x, 0) / atrasos.length;
    if (atrasoAvg > 14) {
      proba -= 0.1;
      motivos.push(`paga ${Math.round(atrasoAvg)}d tarde en promedio`);
    } else if (atrasoAvg <= 3) {
      proba += 0.05;
      motivos.push("buen pagador histórico");
    }
  } else if (cuota.numero_cuota > 1) {
    // Cuota 2+ pero no hay ninguna pagada → mala señal
    const tienePagado = historico.some((p) => p.estado === "pagado");
    if (!tienePagado) {
      proba -= 0.15;
      motivos.push("sin pagos previos");
    }
  }

  // Refunds anteriores → señal muy mala
  const tieneRefund = historico.some((p) => p.estado === "refund");
  if (tieneRefund) {
    proba -= 0.25;
    motivos.push("refunds previos");
  }

  // Snooze activo: si está snoozed_until > hoy, considerar OK por ahora
  if (cuota.snoozed_until && cuota.snoozed_until > todayStr) {
    motivos.push(`pospuesta hasta ${cuota.snoozed_until}`);
    // Esto neutraliza la penalidad de "vencida"
    proba = Math.max(proba, 0.7);
  }

  proba = Math.max(0.05, Math.min(0.95, proba));

  let score: RiskAssessment["score"];
  if (proba >= 0.8) score = "ok";
  else if (proba >= 0.6) score = "bajo";
  else if (proba >= 0.4) score = "medio";
  else score = "alto";

  return { score, proba_cobro: proba, motivos };
}

/**
 * Días entre dos fechas YYYY-MM-DD (b − a). Positivo si b > a.
 */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/**
 * Forecast por mes — agrupa cuotas pendientes por mes de fecha_vencimiento,
 * ponderadas por probabilidad de cobro (suma simple si no se quiere ponderar).
 */
export interface MonthForecast {
  ym: string; // YYYY-MM
  label: string; // "Junio 2026"
  total_nominal: number; // suma de monto_usd
  total_ponderado: number; // suma de monto_usd × proba_cobro
  count: number;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function forecastByMonth(
  cuotasPendientes: PaymentLite[],
  historicoPorLead: Map<string, PaymentLite[]>,
  todayStr: string,
  monthsAhead: number = 3
): MonthForecast[] {
  const today = new Date(todayStr + "T00:00:00");
  const map = new Map<string, MonthForecast>();

  // Inicializar meses futuros
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(ym, {
      ym,
      label: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
      total_nominal: 0,
      total_ponderado: 0,
      count: 0,
    });
  }

  for (const c of cuotasPendientes) {
    if (!c.fecha_vencimiento) continue;
    const ym = c.fecha_vencimiento.slice(0, 7);
    if (!map.has(ym)) continue;
    const histo = historicoPorLead.get(c.lead_id || "") || [];
    const r = scoreCuotaRiesgo(c, histo, todayStr);
    const bucket = map.get(ym)!;
    bucket.total_nominal += Number(c.monto_usd || 0);
    bucket.total_ponderado += Number(c.monto_usd || 0) * r.proba_cobro;
    bucket.count++;
  }

  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

/**
 * Cash proyectado del mes actual:
 *   ya_cobrado + pendientes_del_mes × proba_cobro
 */
export interface MonthProjection {
  ya_cobrado: number;
  pendiente_nominal: number;
  pendiente_ponderado: number;
  proyectado_total: number; // ya_cobrado + pendiente_ponderado
  cuotas_en_riesgo: number; // count con score "alto"
}

export function projectThisMonth(
  paymentsPagados: PaymentLite[],
  cuotasPendientesMes: PaymentLite[],
  historicoPorLead: Map<string, PaymentLite[]>,
  fiscalStart: string,
  fiscalEnd: string,
  todayStr: string
): MonthProjection {
  const yaCobrado = paymentsPagados
    .filter((p) => p.estado === "pagado" && p.fecha_pago && p.fecha_pago >= fiscalStart && p.fecha_pago <= fiscalEnd)
    .reduce((s, p) => s + Number(p.monto_usd || 0), 0);

  let pendienteNominal = 0;
  let pendientePonderado = 0;
  let enRiesgo = 0;

  for (const c of cuotasPendientesMes) {
    const histo = historicoPorLead.get(c.lead_id || "") || [];
    const r = scoreCuotaRiesgo(c, histo, todayStr);
    const monto = Number(c.monto_usd || 0);
    pendienteNominal += monto;
    pendientePonderado += monto * r.proba_cobro;
    if (r.score === "alto") enRiesgo++;
  }

  return {
    ya_cobrado: Math.round(yaCobrado),
    pendiente_nominal: Math.round(pendienteNominal),
    pendiente_ponderado: Math.round(pendientePonderado),
    proyectado_total: Math.round(yaCobrado + pendientePonderado),
    cuotas_en_riesgo: enRiesgo,
  };
}
