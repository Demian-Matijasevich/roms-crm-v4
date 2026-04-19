import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalMonth, getToday } from "@/lib/date-utils";
import { getUsdRate } from "@/lib/queries/settings";
import { computeTeamCommissions } from "@/lib/commissions";
import FinanzasClient from "./FinanzasClient";
import type { MonthlyCash, TreasuryRow, Commission } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface GastoRow {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string | null;
  monto_usd: number;
  monto_ars: number;
  billetera: string | null;
  pagado_a: string | null;
  pagado_por: string | null;
  estado: string;
  created_at: string;
}

export default async function FinanzasPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();
  const currentFiscalMonth = getFiscalMonth(getToday());

  const [monthlyCashRes, treasuryRes, gastosRes, paymentsRes, ingresosRes, leadsForCommRes, teamRes, campaignsRes, usdRate] =
    await Promise.all([
      supabase.from("v_monthly_cash").select("*"),
      supabase.from("v_treasury").select("*"),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }),
      supabase
        .from("payments")
        .select("id, lead_id, monto_usd, receptor, fecha_pago, estado, metodo_pago")
        .eq("estado", "pagado"),
      supabase
        .from("payments")
        .select("id, lead_id, monto_usd, monto_ars, fecha_pago, numero_cuota, metodo_pago, receptor, es_renovacion, lead:leads!payments_lead_id_fkey(nombre)")
        .eq("estado", "pagado")
        .not("fecha_pago", "is", null)
        .order("fecha_pago", { ascending: false })
        .range(0, 4999),
      supabase
        .from("leads")
        .select("id, closer_id, setter_id, utm_medium, programa_pitcheado")
        .range(0, 9999),
      supabase
        .from("team_members")
        .select("id, nombre, is_closer, is_setter")
        .eq("activo", true),
      supabase.from("utm_campaigns").select("medium, setter_id"),
      getUsdRate(),
    ]);

  // Compute commissions per month using Valen scheme (7/5/7 × multiplicador, cap 10%) + setter 3%
  const allPayments = (paymentsRes.data ?? []) as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>;
  const leadsForComm = (leadsForCommRes.data ?? []) as Array<{ id: string; closer_id: string | null; setter_id: string | null; utm_medium: string | null; programa_pitcheado: string | null }>;
  const teamData = (teamRes.data ?? []) as Array<{ id: string; nombre: string; is_closer: boolean; is_setter: boolean }>;
  const campaignsData = (campaignsRes.data ?? []) as Array<{ medium: string | null; setter_id: string | null }>;

  // Build set of months present in payments
  const monthsSet = new Set<string>();
  for (const p of allPayments) {
    if (!p.fecha_pago) continue;
    const d = p.fecha_pago.split("T")[0];
    monthsSet.add(d.substring(0, 7)); // YYYY-MM
  }

  const commissions: Commission[] = [];
  for (const ym of monthsSet) {
    const [y, m] = ym.split("-").map(Number);
    const start = `${ym}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${ym}-${String(lastDay).padStart(2, "0")}`;
    const rows = computeTeamCommissions({
      leads: leadsForComm,
      payments: allPayments,
      team: teamData,
      campaigns: campaignsData,
      monthStart: start,
      monthEnd: end,
    });
    const label = getFiscalMonth(new Date(y, m - 1, 1));
    for (const r of rows) {
      commissions.push({
        team_member_id: r.id,
        nombre: r.nombre,
        mes_fiscal: label,
        comision_closer: r.comision_closer,
        comision_setter: r.comision_setter,
        comision_total: r.comision_total,
      });
    }
  }

  const ingresos = ((ingresosRes.data as unknown[]) ?? []).map((r) => {
    const p = r as Record<string, unknown>;
    const lead = p.lead as Record<string, unknown> | null;
    return {
      id: p.id as string,
      lead_id: (p.lead_id as string) || null,
      lead_nombre: (lead?.nombre as string) || null,
      monto_usd: (p.monto_usd as number) || 0,
      monto_ars: (p.monto_ars as number) || 0,
      fecha_pago: (p.fecha_pago as string) || "",
      numero_cuota: (p.numero_cuota as number) || 1,
      metodo_pago: (p.metodo_pago as string) || null,
      receptor: (p.receptor as string) || null,
      es_renovacion: (p.es_renovacion as boolean) || false,
    };
  });

  return (
    <FinanzasClient
      monthlyCash={(monthlyCashRes.data as MonthlyCash[]) ?? []}
      commissions={commissions}
      treasury={(treasuryRes.data as TreasuryRow[]) ?? []}
      gastos={(gastosRes.data as GastoRow[]) ?? []}
      ingresos={ingresos}
      usdRate={usdRate}
      payments={
        (paymentsRes.data as {
          id: string;
          monto_usd: number;
          receptor: string | null;
          fecha_pago: string | null;
          estado: string;
          metodo_pago: string | null;
        }[]) ?? []
      }
      currentFiscalMonth={currentFiscalMonth}
    />
  );
}

export interface IngresoRow {
  id: string;
  lead_id: string | null;
  lead_nombre: string | null;
  monto_usd: number;
  monto_ars: number;
  fecha_pago: string;
  numero_cuota: number;
  metodo_pago: string | null;
  receptor: string | null;
  es_renovacion: boolean;
}
