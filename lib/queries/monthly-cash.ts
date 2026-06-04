/**
 * Recomputa MonthlyCash[] desde payments + leads en JS.
 * Sirve para aplicar filtro por nicho que la vista `v_monthly_cash` no soporta.
 *
 * Replica la lógica de supabase/migrations/004_views.sql:
 *   cash_ventas_nuevas: c#1 pagada NO renovación
 *   cash_renovaciones: cualquier cuota pagada de renovación
 *   cash_cuotas:       c#>1 pagada NO renovación
 *   cash_total:        suma pagados - suma refunds
 *   facturacion:       sum(ticket_total) de leads cuya c#1 se pagó en el mes
 *   ventas_nuevas_count: distinct lead_id con c#1 pagada NO renovación
 *   renovaciones_count: count de payments c#1 pagados de renovación
 *   saldo_pendiente_30d: pendientes con vencimiento últimos 30 días
 */
import { parseLocalDate, getFiscalMonth, getToday } from "@/lib/date-utils";
import type { MonthlyCash } from "@/lib/types";

type Pay = {
  lead_id: string | null;
  monto_usd: number;
  numero_cuota: number;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  estado: string;
  es_renovacion: boolean;
};

type LeadLite = { id: string; ticket_total: number };

export function computeMonthlyCash(payments: Pay[], leads: LeadLite[]): MonthlyCash[] {
  const leadTicketById = new Map(leads.map((l) => [l.id, Number(l.ticket_total || 0)]));
  const allowedLeadIds = new Set(leads.map((l) => l.id));

  const filtered = payments.filter((p) => {
    if (!p.lead_id) return false;
    return allowedLeadIds.has(p.lead_id);
  });

  // Group by fiscal month label
  const byMonth = new Map<string, MonthlyCash>();
  const ensureMonth = (label: string): MonthlyCash => {
    let m = byMonth.get(label);
    if (!m) {
      m = {
        mes_fiscal: label,
        cash_ventas_nuevas: 0,
        cash_renovaciones: 0,
        cash_cuotas: 0,
        cash_total: 0,
        refunds: 0,
        facturacion: 0,
        ventas_nuevas_count: 0,
        renovaciones_count: 0,
        saldo_pendiente_30d: 0,
      };
      byMonth.set(label, m);
    }
    return m;
  };

  // Track distinct lead_id con c#1 pagada por mes para count y facturación
  const cuota1LeadsPorMes = new Map<string, Set<string>>();

  for (const p of filtered) {
    if (!p.fecha_pago) continue;
    if (p.estado !== "pagado" && p.estado !== "refund") continue;

    const label = getFiscalMonth(parseLocalDate(p.fecha_pago));
    const m = ensureMonth(label);
    const monto = Number(p.monto_usd || 0);

    if (p.estado === "refund") {
      m.refunds += monto;
      m.cash_total -= monto;
      continue;
    }

    // estado === "pagado"
    m.cash_total += monto;
    if (!p.es_renovacion && p.numero_cuota === 1) {
      m.cash_ventas_nuevas += monto;
      if (p.lead_id) {
        if (!cuota1LeadsPorMes.has(label)) cuota1LeadsPorMes.set(label, new Set());
        cuota1LeadsPorMes.get(label)!.add(p.lead_id);
      }
    } else if (p.es_renovacion) {
      m.cash_renovaciones += monto;
      if (p.numero_cuota === 1) m.renovaciones_count += 1;
    } else if (p.numero_cuota > 1) {
      m.cash_cuotas += monto;
    }
  }

  // ventas_nuevas_count + facturacion
  for (const [label, leadSet] of cuota1LeadsPorMes.entries()) {
    const m = ensureMonth(label);
    m.ventas_nuevas_count = leadSet.size;
    let fact = 0;
    for (const lid of leadSet) fact += leadTicketById.get(lid) || 0;
    m.facturacion = fact;
  }

  // saldo_pendiente_30d: pendientes con venc en últimos 30 días (single value per all months, copia)
  const today = getToday();
  const todayStr = today.toISOString().slice(0, 10);
  const back30 = new Date(today);
  back30.setDate(back30.getDate() - 30);
  const back30Str = back30.toISOString().slice(0, 10);
  let saldoPend30 = 0;
  for (const p of filtered) {
    if (p.estado !== "pendiente") continue;
    if (!p.fecha_vencimiento) continue;
    if (p.fecha_vencimiento >= back30Str && p.fecha_vencimiento <= todayStr) {
      saldoPend30 += Number(p.monto_usd || 0);
    }
  }
  for (const m of byMonth.values()) m.saldo_pendiente_30d = saldoPend30;

  return Array.from(byMonth.values()).sort((a, b) => a.mes_fiscal.localeCompare(b.mes_fiscal));
}
