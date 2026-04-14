import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalMonth, getToday } from "@/lib/date-utils";
import { getUsdRate } from "@/lib/queries/settings";
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

  const [monthlyCashRes, commissionsRes, treasuryRes, gastosRes, paymentsRes, ingresosRes, usdRate] =
    await Promise.all([
      supabase.from("v_monthly_cash").select("*"),
      supabase.from("v_commissions").select("*"),
      supabase.from("v_treasury").select("*"),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }),
      supabase
        .from("payments")
        .select("id, monto_usd, receptor, fecha_pago, estado, metodo_pago")
        .eq("estado", "pagado"),
      supabase
        .from("payments")
        .select("id, lead_id, monto_usd, monto_ars, fecha_pago, numero_cuota, metodo_pago, receptor, es_renovacion, lead:leads!payments_lead_id_fkey(nombre)")
        .eq("estado", "pagado")
        .not("fecha_pago", "is", null)
        .order("fecha_pago", { ascending: false })
        .range(0, 4999),
      getUsdRate(),
    ]);

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
      commissions={(commissionsRes.data as Commission[]) ?? []}
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
