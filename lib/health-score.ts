/**
 * Health score automático para clientes (0-100).
 *
 * Inputs por cliente:
 *  - días desde último contacto (followup, sesión, pago)
 *  - cuotas atrasadas count + monto
 *  - tier del programa
 *  - estado del cliente (activo/pausado/inactivo)
 *  - tiempo desde onboarding
 *
 * Score:
 *  100 = perfecto (activo, sin atrasos, contacto reciente)
 *   70-89 = saludable
 *   50-69 = atención (riesgo medio)
 *   30-49 = alerta (riesgo alto)
 *    0-29 = crítico (probable churn)
 */

export interface HealthScoreInputs {
  dias_sin_contacto: number; // 0 = hoy, 30 = hace un mes
  cuotas_atrasadas_count: number;
  cuotas_atrasadas_total_usd: number;
  ticket_total: number;
  estado: string; // activo | pausado | inactivo | no_termino_pagar | solo_skool
  dias_desde_onboarding: number;
}

export interface HealthScoreResult {
  score: number; // 0-100
  level: "critico" | "alerta" | "atencion" | "saludable" | "perfecto";
  motivos: string[];
}

export function computeHealthScore(i: HealthScoreInputs): HealthScoreResult {
  let score = 100;
  const motivos: string[] = [];

  // Estado del cliente
  if (i.estado === "inactivo") {
    score -= 60;
    motivos.push("inactivo");
  } else if (i.estado === "pausado") {
    score -= 30;
    motivos.push("pausado");
  } else if (i.estado === "no_termino_pagar") {
    score -= 50;
    motivos.push("no terminó de pagar");
  }

  // Días sin contacto
  if (i.dias_sin_contacto > 60) {
    score -= 25;
    motivos.push(`${i.dias_sin_contacto}d sin contacto`);
  } else if (i.dias_sin_contacto > 30) {
    score -= 12;
    motivos.push(`${i.dias_sin_contacto}d sin contacto`);
  } else if (i.dias_sin_contacto > 14) {
    score -= 5;
  }

  // Cuotas atrasadas
  if (i.cuotas_atrasadas_count > 0) {
    const pen = Math.min(30, i.cuotas_atrasadas_count * 10);
    score -= pen;
    motivos.push(`${i.cuotas_atrasadas_count} cuotas atrasadas`);
  }

  // Bonus por tier alto y constante
  if (i.ticket_total >= 30000 && i.estado === "activo") {
    score += 5;
  }

  // Onboarding reciente bonus (clientes nuevos no penalizar tanto)
  if (i.dias_desde_onboarding < 30 && i.dias_sin_contacto < 14) {
    score = Math.max(score, 80);
  }

  score = Math.max(0, Math.min(100, score));

  let level: HealthScoreResult["level"];
  if (score >= 90) level = "perfecto";
  else if (score >= 70) level = "saludable";
  else if (score >= 50) level = "atencion";
  else if (score >= 30) level = "alerta";
  else level = "critico";

  return { score, level, motivos };
}
