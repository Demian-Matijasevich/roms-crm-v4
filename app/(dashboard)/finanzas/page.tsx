import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalMonth, getToday } from "@/lib/date-utils";
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

  const [monthlyCashRes, commissionsRes, treasuryRes, gastosRes, paymentsRes] =
    await Promise.all([
      supabase.from("v_monthly_cash").select("*"),
      supabase.from("v_commissions").select("*"),
      supabase.from("v_treasury").select("*"),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }),
      supabase
        .from("payments")
        .select("id, monto_usd, receptor, fecha_pago, estado, metodo_pago")
        .eq("estado", "pagado"),
    ]);

  return (
    <FinanzasClient
      monthlyCash={(monthlyCashRes.data as MonthlyCash[]) ?? []}
      commissions={(commissionsRes.data as Commission[]) ?? []}
      treasury={(treasuryRes.data as TreasuryRow[]) ?? []}
      gastos={(gastosRes.data as GastoRow[]) ?? []}
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
