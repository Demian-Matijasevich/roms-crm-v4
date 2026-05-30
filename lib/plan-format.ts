/**
 * Formatea un plan de pago al estilo Secure Scale: "Omnipresencia | PP | $21.000 (3x $7.000)".
 * Si solo se quiere el detalle de cuotas: "3x $7.000".
 */
export type PlanPago = "paid_in_full" | "2_cuotas" | "3_cuotas" | "personalizado" | string | null | undefined;
export type Programa = "roms_7" | "consultoria" | "omnipresencia" | "multicuentas" | string | null | undefined;

const PROGRAMA_LABEL: Record<string, string> = {
  roms_7: "ROMS 7",
  consultoria: "Consultoría",
  omnipresencia: "Omnipresencia",
  multicuentas: "Multicuenta",
};

export function planCuotasCount(plan: PlanPago): number {
  if (!plan) return 1;
  if (plan === "paid_in_full") return 1;
  if (plan === "2_cuotas") return 2;
  if (plan === "3_cuotas") return 3;
  return 1;
}

export function planLabel(plan: PlanPago): string {
  if (!plan) return "—";
  if (plan === "paid_in_full") return "PIF";
  if (plan === "2_cuotas") return "PP";
  if (plan === "3_cuotas") return "PP";
  if (plan === "personalizado") return "Custom";
  return String(plan);
}

export function formatPlanDetail(plan: PlanPago, ticket: number): string {
  if (!ticket || ticket <= 0) return "—";
  const n = planCuotasCount(plan);
  if (n <= 1) return `$${Math.round(ticket).toLocaleString("es-AR")}`;
  const cuota = Math.round(ticket / n).toLocaleString("es-AR");
  return `$${Math.round(ticket).toLocaleString("es-AR")} (${n}x $${cuota})`;
}

export function formatProgramFull(programa: Programa, plan: PlanPago, ticket: number): string {
  const progLabel = (programa && PROGRAMA_LABEL[programa as string]) || (programa as string) || "—";
  const planLab = planLabel(plan);
  const detail = formatPlanDetail(plan, ticket);
  return `${progLabel} | ${planLab} | ${detail}`;
}
