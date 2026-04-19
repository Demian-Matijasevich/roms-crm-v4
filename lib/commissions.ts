/**
 * Valentino's commission scheme (April 2026 onwards):
 * - Base: Omnipresencia 7%, Multicuentas 5%, Consultoria 7%
 * - Monthly cash multiplier:
 *   - ≤ 70k: 1.00x
 *   - 70k-100k: 1.15x
 *   - > 100k: 1.30x
 * - Cap: 10%
 * Setter: 3% flat of cash collected for their leads
 */
export function computeValenCommission(
  payments: { monto_usd: number; programa: string | null }[],
  monthlyCashTotal: number
): { omni: number; multi: number; consultoria: number; total: number; pctEff: { omni: number; multi: number; consultoria: number } } {
  const mul = monthlyCashTotal <= 70000 ? 1.0 : monthlyCashTotal <= 100000 ? 1.15 : 1.3;
  const baseOmni = 7, baseMulti = 5, baseConsultoria = 7;
  const pctOmni = Math.min(baseOmni * mul, 10);
  const pctMulti = Math.min(baseMulti * mul, 10);
  const pctConsultoria = Math.min(baseConsultoria * mul, 10);

  let omni = 0, multi = 0, consultoria = 0;
  for (const p of payments) {
    const prog = (p.programa || "").toLowerCase();
    if (prog.includes("multi")) multi += p.monto_usd * (pctMulti / 100);
    else if (prog.includes("consult")) consultoria += p.monto_usd * (pctConsultoria / 100);
    else omni += p.monto_usd * (pctOmni / 100);
  }
  return { omni, multi, consultoria, total: omni + multi + consultoria, pctEff: { omni: pctOmni, multi: pctMulti, consultoria: pctConsultoria } };
}

export const SETTER_PCT = 0.03;

interface LeadLite {
  id: string;
  closer_id: string | null;
  setter_id: string | null;
  utm_medium: string | null;
  programa_pitcheado: string | null;
}

interface PaymentLite {
  lead_id: string | null;
  monto_usd: number;
  fecha_pago: string | null;
  estado: string;
}

interface TeamLite {
  id: string;
  nombre: string;
  is_closer: boolean;
  is_setter: boolean;
}

interface CampaignLite {
  medium: string | null;
  setter_id: string | null;
}

export interface TeamCommissionRow {
  id: string;
  nombre: string;
  comision_closer: number;
  comision_setter: number;
  comision_total: number;
}

/**
 * Compute per-team-member commission for a given fiscal month range (YYYY-MM-DD inclusive).
 * Uses Valen scheme for closers and 3% flat for setters.
 * Setter attribution: lead.setter_id first, fallback to utm_medium → campaigns.setter_id.
 */
export function computeTeamCommissions(args: {
  leads: LeadLite[];
  payments: PaymentLite[];
  team: TeamLite[];
  campaigns: CampaignLite[];
  monthStart: string;
  monthEnd: string;
}): TeamCommissionRow[] {
  const { leads, payments, team, campaigns, monthStart, monthEnd } = args;

  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns) {
    if (c.setter_id && c.medium) mediumToSetter.set(c.medium.toLowerCase(), c.setter_id);
  }

  const leadById = new Map<string, LeadLite>();
  for (const l of leads) leadById.set(l.id, l);

  function resolveSetter(l: LeadLite): string | null {
    if (l.setter_id) return l.setter_id;
    if (l.utm_medium) return mediumToSetter.get(l.utm_medium.toLowerCase()) || null;
    return null;
  }

  // Filter payments in month + pagado
  const monthPays = payments.filter((p) => {
    if (p.estado !== "pagado" || !p.fecha_pago || !p.lead_id) return false;
    const f = p.fecha_pago.split("T")[0];
    return f >= monthStart && f <= monthEnd;
  });

  // Per-closer payment list + cash
  const closerPays = new Map<string, { monto_usd: number; programa: string | null }[]>();
  const closerCash = new Map<string, number>();
  const setterCash = new Map<string, number>();

  for (const p of monthPays) {
    const l = leadById.get(p.lead_id!);
    if (!l) continue;

    if (l.closer_id) {
      if (!closerPays.has(l.closer_id)) closerPays.set(l.closer_id, []);
      closerPays.get(l.closer_id)!.push({ monto_usd: p.monto_usd, programa: l.programa_pitcheado });
      closerCash.set(l.closer_id, (closerCash.get(l.closer_id) || 0) + p.monto_usd);
    }

    const sid = resolveSetter(l);
    if (sid) {
      setterCash.set(sid, (setterCash.get(sid) || 0) + p.monto_usd);
    }
  }

  const rows: TeamCommissionRow[] = [];
  for (const t of team) {
    let comision_closer = 0;
    let comision_setter = 0;

    if (t.is_closer) {
      const pays = closerPays.get(t.id) || [];
      const cash = closerCash.get(t.id) || 0;
      if (cash > 0) comision_closer = computeValenCommission(pays, cash).total;
    }
    if (t.is_setter) {
      const cash = setterCash.get(t.id) || 0;
      comision_setter = cash * SETTER_PCT;
    }

    const total = comision_closer + comision_setter;
    if (total > 0) {
      rows.push({
        id: t.id,
        nombre: t.nombre,
        comision_closer: Math.round(comision_closer),
        comision_setter: Math.round(comision_setter),
        comision_total: Math.round(total),
      });
    }
  }

  return rows.sort((a, b) => b.comision_total - a.comision_total);
}
