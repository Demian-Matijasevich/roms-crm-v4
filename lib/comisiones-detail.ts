/**
 * Cálculo detallado de comisiones (Valen scheme) + descuentos por refund.
 * Devuelve la estructura por team member + el texto WA formateado.
 *
 * Usado por /comisiones (UI) y por scripts/wa-comisiones.mjs.
 */

import type { Lead, Payment, TeamMember } from "@/lib/types";

export interface ComisionPago {
  cliente: string;
  numero_cuota: number;
  monto: number;
  programa: string | null;
  payment_id: string;
}

export interface ComisionRefund {
  payment_id: string;
  cliente: string;
  monto: number;
  programa: string | null;
  closer_id: string | null;
  setter_id: string | null;
  closer_nombre: string | null;
  setter_nombre: string | null;
  desc_closer: number;
  desc_setter: number;
}

export interface ComisionPersona {
  team_member_id: string;
  nombre: string;
  is_closer: boolean;
  is_setter: boolean;
  cash_closer: number;
  cash_setter: number;
  tier_mul: number;
  tier_label: string;
  pays_closer: ComisionPago[];
  pays_setter: ComisionPago[];
  desc_refunds_closer: { cliente: string; monto: number }[];
  desc_refunds_setter: { cliente: string; monto: number }[];
  // Calculados
  comision_closer_bruta: number;
  comision_setter_bruta: number;
  bruto: number;
  descuento_total: number;
  total_neto: number;
}

export interface ComisionResult {
  mes_label: string;
  start_str: string;
  end_str: string;
  refunds: ComisionRefund[];
  personas: ComisionPersona[];
  total_a_pagar: number;
  total_descuentos: number;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function programaKey(programa: string | null | undefined): "omni" | "multi" | "consultoria" | "otro" {
  const p = (programa || "").toLowerCase();
  if (p.includes("multi")) return "multi";
  if (p.includes("consult")) return "consultoria";
  if (p.includes("omni")) return "omni";
  return "otro";
}

export function basePct(key: ReturnType<typeof programaKey>): number {
  if (key === "multi") return 5;
  return 7;
}

export function tierMul(cash: number): number {
  if (cash <= 70000) return 1.0;
  if (cash <= 100000) return 1.15;
  return 1.3;
}

export function tierLabel(cash: number): string {
  const m = tierMul(cash);
  if (m === 1) return "x1";
  if (m === 1.15) return "x1.15 (>70k)";
  return "x1.3 (>100k)";
}

export function effectivePct(programa: string | null | undefined, cash: number): number {
  return Math.min(basePct(programaKey(programa)) * tierMul(cash), 10);
}

interface LeadLite {
  id: string;
  nombre: string | null;
  closer_id: string | null;
  setter_id: string | null;
  utm_medium: string | null;
  programa_pitcheado: string | null;
}

interface PaymentLite {
  id: string;
  lead_id: string | null;
  numero_cuota: number;
  monto_usd: number;
  fecha_pago: string | null;
  estado: string;
  es_renovacion: boolean;
  descuento_comision_closer_usd?: number | null;
  descuento_comision_setter_usd?: number | null;
  aplicado_en_comisiones_mes?: string | null;
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

export function computeComisionesDetail(args: {
  targetYM: string; // "2026-05"
  leads: LeadLite[];
  payments: PaymentLite[];
  team: TeamLite[];
  campaigns: CampaignLite[];
  skipRefundIds?: Set<string>;
  // Si true, los refunds del mes que ya tienen aplicado_en_comisiones_mes != null se ignoran
  skipRefundsAplicados?: boolean;
}): ComisionResult {
  const [year, month] = args.targetYM.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const startStr = `${args.targetYM}-01`;
  const endStr = `${args.targetYM}-${String(lastDay).padStart(2, "0")}`;
  const mesLabel = `${MESES[month - 1]} ${year}`.toUpperCase();

  const memberById = new Map(args.team.map((t) => [t.id, t]));
  const leadById = new Map(args.leads.map((l) => [l.id, l]));
  const mediumToSetter = new Map<string, string>();
  for (const c of args.campaigns) {
    if (c.setter_id && c.medium) mediumToSetter.set(c.medium.toLowerCase(), c.setter_id);
  }
  const resolveSetter = (l: LeadLite): string | null => {
    if (l.setter_id) return l.setter_id;
    if (l.utm_medium) return mediumToSetter.get(l.utm_medium.toLowerCase()) || null;
    return null;
  };

  // Filtrar payments del mes
  const monthPays = args.payments.filter((p) => {
    if (!p.fecha_pago || !p.lead_id) return false;
    const f = p.fecha_pago.split("T")[0];
    return f >= startStr && f <= endStr;
  });

  const pagosOK = monthPays.filter((p) => p.estado === "pagado");
  const skipIds = args.skipRefundIds || new Set<string>();
  const refunds = monthPays.filter((p) => {
    if (p.estado !== "refund") return false;
    if (skipIds.has(p.id)) return false;
    if (args.skipRefundsAplicados && p.aplicado_en_comisiones_mes && p.aplicado_en_comisiones_mes !== args.targetYM) return false;
    return true;
  });

  // Estructura por persona
  const personaMap = new Map<string, ComisionPersona>();
  function getPersona(id: string): ComisionPersona | null {
    const m = memberById.get(id);
    if (!m) return null;
    if (!personaMap.has(id)) {
      personaMap.set(id, {
        team_member_id: id,
        nombre: m.nombre,
        is_closer: m.is_closer,
        is_setter: m.is_setter,
        cash_closer: 0,
        cash_setter: 0,
        tier_mul: 1,
        tier_label: "x1",
        pays_closer: [],
        pays_setter: [],
        desc_refunds_closer: [],
        desc_refunds_setter: [],
        comision_closer_bruta: 0,
        comision_setter_bruta: 0,
        bruto: 0,
        descuento_total: 0,
        total_neto: 0,
      });
    }
    return personaMap.get(id)!;
  }

  for (const p of pagosOK) {
    const l = leadById.get(p.lead_id!);
    if (!l) continue;
    const monto = Number(p.monto_usd || 0);
    if (l.closer_id) {
      const m = memberById.get(l.closer_id);
      if (m?.is_closer) {
        const persona = getPersona(l.closer_id)!;
        persona.cash_closer += monto;
        persona.pays_closer.push({
          cliente: l.nombre || "(s/n)",
          numero_cuota: p.numero_cuota,
          monto,
          programa: l.programa_pitcheado,
          payment_id: p.id,
        });
      }
    }
    const sid = resolveSetter(l);
    if (sid) {
      const m = memberById.get(sid);
      if (m?.is_setter) {
        const persona = getPersona(sid)!;
        persona.cash_setter += monto;
        persona.pays_setter.push({
          cliente: l.nombre || "(s/n)",
          numero_cuota: p.numero_cuota,
          monto,
          programa: l.programa_pitcheado,
          payment_id: p.id,
        });
      }
    }
  }

  // Calcular tier por persona después de tener todo el cash
  for (const persona of personaMap.values()) {
    persona.tier_mul = tierMul(persona.cash_closer);
    persona.tier_label = tierLabel(persona.cash_closer);
  }

  // Calcular comisión bruta del closer (sum × pctEff por pay)
  for (const persona of personaMap.values()) {
    let com = 0;
    for (const pay of persona.pays_closer) {
      const pct = effectivePct(pay.programa, persona.cash_closer);
      com += pay.monto * (pct / 100);
    }
    persona.comision_closer_bruta = com;
    persona.comision_setter_bruta = persona.cash_setter * 0.03;
    persona.bruto = persona.comision_closer_bruta + persona.comision_setter_bruta;
  }

  // Refunds: armar lista + asignar descuentos
  const refundsList: ComisionRefund[] = [];
  for (const r of refunds) {
    const l = leadById.get(r.lead_id!);
    if (!l) continue;
    const monto = Number(r.monto_usd || 0);
    let descCloser = Number(r.descuento_comision_closer_usd || 0);
    let descSetter = Number(r.descuento_comision_setter_usd || 0);

    // Default si no se cargó manual
    if (descCloser === 0 && l.closer_id) {
      const persona = personaMap.get(l.closer_id);
      const cashCloser = persona?.cash_closer || 0;
      const pct = effectivePct(l.programa_pitcheado, cashCloser);
      descCloser = monto * (pct / 100);
    }
    const sid = resolveSetter(l);
    if (descSetter === 0 && sid) {
      descSetter = monto * 0.03;
    }

    refundsList.push({
      payment_id: r.id,
      cliente: l.nombre || "(s/n)",
      monto,
      programa: l.programa_pitcheado,
      closer_id: l.closer_id,
      setter_id: sid,
      closer_nombre: l.closer_id ? memberById.get(l.closer_id)?.nombre || null : null,
      setter_nombre: sid ? memberById.get(sid)?.nombre || null : null,
      desc_closer: descCloser,
      desc_setter: descSetter,
    });

    // Asignar a la persona (si tiene cash o no)
    if (l.closer_id && descCloser > 0 && memberById.get(l.closer_id)?.is_closer) {
      const persona = getPersona(l.closer_id)!;
      persona.desc_refunds_closer.push({ cliente: l.nombre || "(s/n)", monto: descCloser });
    }
    if (sid && descSetter > 0 && memberById.get(sid)?.is_setter) {
      const persona = getPersona(sid)!;
      persona.desc_refunds_setter.push({ cliente: l.nombre || "(s/n)", monto: descSetter });
    }
  }

  // Total descuento + neto
  for (const persona of personaMap.values()) {
    const dc = persona.desc_refunds_closer.reduce((s, r) => s + r.monto, 0);
    const ds = persona.desc_refunds_setter.reduce((s, r) => s + r.monto, 0);
    persona.descuento_total = dc + ds;
    persona.total_neto = persona.bruto - persona.descuento_total;
  }

  const personas = [...personaMap.values()].sort((a, b) => b.total_neto - a.total_neto);
  const total_a_pagar = personas.reduce((s, p) => s + p.total_neto, 0);
  const total_descuentos = personas.reduce((s, p) => s + p.descuento_total, 0);

  return {
    mes_label: mesLabel,
    start_str: startStr,
    end_str: endStr,
    refunds: refundsList,
    personas,
    total_a_pagar,
    total_descuentos,
  };
}

// ── Formato WA ──
export function formatComisionesWA(r: ComisionResult): string {
  const fmt = (n: number) => {
    const v = Math.round(Number(n || 0) * 100) / 100;
    const hasDec = Math.abs(v - Math.round(v)) > 0.01;
    return "$" + (hasDec ? v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString("es-AR"));
  };
  const SEP = "═══════════════════════════════════════════════";
  const lines: string[] = [];
  lines.push(SEP);
  lines.push(`💼 COMISIONES A PAGAR - ${r.mes_label}`);
  lines.push(SEP);
  lines.push("");

  if (r.refunds.length > 0) {
    lines.push("🔄 Refunds aplicados:");
    for (const ref of r.refunds) {
      const progAbbr = programaKey(ref.programa) === "consultoria" ? "Consult"
        : programaKey(ref.programa) === "multi" ? "Multi"
        : programaKey(ref.programa) === "omni" ? "Omni" : "Otro";
      const parts: string[] = [];
      if (ref.closer_nombre && ref.desc_closer > 0) parts.push(`${ref.closer_nombre} −${fmt(ref.desc_closer)}`);
      if (ref.setter_nombre && ref.desc_setter > 0) parts.push(`${ref.setter_nombre} −${fmt(ref.desc_setter)}`);
      const partStr = parts.length > 0 ? " → " + parts.join(" · ") : "";
      lines.push(`   • ${ref.cliente} — ${fmt(ref.monto)} ${progAbbr}${partStr}`);
    }
    lines.push("");
  }

  const PROGRAMA_LABEL: Record<string, string> = {
    omni: "Omnipresencia",
    multi: "Multicuentas",
    consultoria: "Consultoría",
    otro: "Otros",
  };

  for (const p of r.personas) {
    if (p.bruto === 0 && p.descuento_total === 0) continue;
    lines.push(SEP);

    if (p.is_closer && p.pays_closer.length > 0) {
      lines.push(`💼 ${p.nombre.toUpperCase()}`);
      lines.push(`💰 Cash closer: ${fmt(p.cash_closer)} · Tier ${p.tier_label}`);
      lines.push("");

      const byProg: Record<string, ComisionPago[]> = { omni: [], multi: [], consultoria: [], otro: [] };
      for (const pay of p.pays_closer) byProg[programaKey(pay.programa)].push(pay);

      for (const key of ["omni", "multi", "consultoria", "otro"]) {
        const list = byProg[key];
        if (list.length === 0) continue;
        const pct = Math.min(basePct(key as "omni") * p.tier_mul, 10);
        const pctStr = pct.toFixed(2).replace(/\.00$/, "");
        lines.push(`📦 ${PROGRAMA_LABEL[key]} (${pctStr}%)`);
        let subCash = 0;
        for (const pay of list) {
          const com = pay.monto * (pct / 100);
          subCash += pay.monto;
          lines.push(`   • ${pay.cliente} (c#${pay.numero_cuota}): ${fmt(pay.monto)} → ${fmt(com)}`);
        }
        lines.push(`   ▸ Subtotal: ${fmt(subCash)} × ${pctStr}% = ${fmt(subCash * (pct / 100))}`);
        lines.push("");
      }

      if (p.is_setter && p.cash_setter > 0) {
        lines.push("👥 COMO SETTER (3% flat)");
        lines.push(`   ▸ Cash atribuido: ${fmt(p.cash_setter)} × 3% = ${fmt(p.comision_setter_bruta)}`);
        lines.push("");
      }
    } else if (p.is_setter && p.pays_setter.length > 0) {
      // Solo setter
      lines.push(`💼 ${p.nombre.toUpperCase()} (solo setter)`);
      lines.push("");
      lines.push("👥 Setter (3%)");
      for (const pay of p.pays_setter) {
        lines.push(`   • ${pay.cliente}: ${fmt(pay.monto)} → ${fmt(pay.monto * 0.03)}`);
      }
      lines.push(`   ▸ Cash setter: ${fmt(p.cash_setter)} × 3% = ${fmt(p.comision_setter_bruta)}`);
      lines.push("");
    } else {
      // Solo descuentos de refund sin cash este mes
      lines.push(`💼 ${p.nombre.toUpperCase()}`);
      lines.push(`💰 Sin cash este mes`);
      lines.push("");
    }

    lines.push(`   Bruto: ${fmt(p.bruto)}`);
    for (const r of p.desc_refunds_closer) lines.push(`   🔄 Refund ${r.cliente}: −${fmt(r.monto)}`);
    for (const r of p.desc_refunds_setter) lines.push(`   🔄 Refund setter ${r.cliente}: −${fmt(r.monto)}`);
    if (p.descuento_total > 0) {
      lines.push(`   ─────────────────────────`);
      lines.push(`   Descuentos: −${fmt(p.descuento_total)}`);
    }
    lines.push(`💎 TOTAL ${p.nombre.toUpperCase()}: ${fmt(p.total_neto)}`);
    lines.push("");
  }

  // Resumen
  lines.push(SEP);
  lines.push("📊 RESUMEN A PAGAR");
  lines.push("");
  const maxLen = Math.max(...r.personas.filter((p) => p.total_neto > 0).map((p) => p.nombre.length), 5);
  for (const p of r.personas) {
    if (p.total_neto === 0) continue;
    lines.push(`   • ${p.nombre.padEnd(maxLen + 2, " ")}${fmt(p.total_neto)}`);
  }
  lines.push(`   ─────────────────────────`);
  lines.push(`   TOTAL:${" ".repeat(Math.max(1, maxLen - 3))}${fmt(r.total_a_pagar)}`);
  if (r.total_descuentos > 0) {
    lines.push("");
    lines.push(`   (Ahorro por refunds: ${fmt(r.total_descuentos)})`);
  }
  lines.push(SEP);
  return lines.join("\n");
}
