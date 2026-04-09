import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, getFiscalMonth, getToday, toDateString } from "@/lib/date-utils";
import type { ObjectiveData } from "./HomeCloser";
import HomeAdmin from "./HomeAdmin";
import HomeCloser from "./HomeCloser";
import HomeSetter from "./HomeSetter";
import type { MonthlyCash, Payment, Client, Lead, CloserKPI, Commission, RenewalQueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();

  if (session.is_admin) {
    // Fetch admin data
    const fiscalStart = getFiscalStart();
    const fiscalEnd = getFiscalEnd();
    const today = toDateString(getToday());

    const [cashRes, paymentsRes, overdueRes, atRiskRes, commissionsRes, pendingPaymentsRes, pipelineLeadsRes, renewalQueueRes] = await Promise.all([
      supabase.from("v_monthly_cash").select("*"),
      // Fetch ALL paid payments (not just current fiscal) so the chart works for any selected month
      supabase
        .from("payments")
        .select("*")
        .eq("estado", "pagado"),
      supabase
        .from("payments")
        .select("*")
        .eq("estado", "pendiente")
        .lte("fecha_vencimiento", today),
      supabase
        .from("clients")
        .select("*")
        .eq("estado", "activo")
        .lt("health_score", 50),
      supabase.from("v_commissions").select("*"),
      // Revenue prediction: pending payments in fiscal period
      supabase
        .from("payments")
        .select("monto_usd")
        .eq("estado", "pendiente")
        .gte("fecha_vencimiento", toDateString(fiscalStart))
        .lte("fecha_vencimiento", toDateString(fiscalEnd)),
      // Revenue prediction: pipeline leads
      supabase
        .from("leads")
        .select("id, nombre, ticket_total, estado")
        .in("estado", ["pendiente", "seguimiento", "reserva"]),
      // Revenue prediction: renewal queue
      supabase
        .from("v_renewal_queue")
        .select("*")
        .in("semaforo", ["urgente", "proximo"]),
    ]);

    // Revenue prediction calculations
    const currentFiscalLabel = getFiscalMonth(getToday());
    const currentCash = (cashRes.data as MonthlyCash[] ?? []).find(m => m.mes_fiscal === currentFiscalLabel);
    const cashCollected = currentCash?.cash_total ?? 0;
    const pendingPaymentsTotal = (pendingPaymentsRes.data ?? []).reduce((s: number, p: { monto_usd: number }) => s + p.monto_usd, 0);
    const pipelineLeads = (pipelineLeadsRes.data ?? []) as Pick<Lead, "id" | "nombre" | "ticket_total" | "estado">[];
    const pipelineTotal = pipelineLeads.reduce((s, l) => s + (l.ticket_total || 0), 0);
    const renewalQueue = (renewalQueueRes.data ?? []) as RenewalQueueRow[];

    // Build commissions from v_commissions for current month
    const currentCommissions = ((commissionsRes.data ?? []) as Commission[])
      .filter(c => c.mes_fiscal === currentFiscalLabel && c.comision_total > 0)
      .map(c => ({
        id: c.team_member_id,
        nombre: c.nombre,
        comision_closer: c.comision_closer,
        comision_setter: c.comision_setter,
        comision_total: c.comision_total,
      }));

    return (
      <HomeAdmin
        monthlyCash={(cashRes.data as MonthlyCash[]) ?? []}
        payments={(paymentsRes.data as Payment[]) ?? []}
        overduePayments={(overdueRes.data as Payment[]) ?? []}
        atRiskClients={(atRiskRes.data as Client[]) ?? []}
        commissions={(commissionsRes.data as Commission[]) ?? []}
        teamCommissions={currentCommissions}
        revPrediction={{
          cashCollected,
          cuotasPendientes: pendingPaymentsTotal,
          pipelineTotal,
          pipelineCount: pipelineLeads.length,
          renewalCount: renewalQueue.length,
          renewalAvgValue: 5000,
        }}
      />
    );
  }

  // Determine primary role
  const roles = session.roles;
  const isCloser = roles.includes("closer");
  const isSetter = roles.includes("setter");

  if (isCloser) {
    const currentFiscalMonth = getFiscalMonth(getToday());
    const [leadsRes, kpisRes, objRes] = await Promise.all([
      supabase
        .from("leads")
        .select("*, closer:team_members!leads_closer_id_fkey(*), setter:team_members!leads_setter_id_fkey(*)")
        .eq("closer_id", session.team_member_id),
      supabase
        .from("v_closer_kpis")
        .select("*")
        .eq("mes_fiscal", currentFiscalMonth),
      supabase
        .from("objectives")
        .select("*")
        .eq("team_member_id", session.team_member_id)
        .eq("mes_fiscal", currentFiscalMonth)
        .maybeSingle(),
    ]);

    return (
      <HomeCloser
        leads={(leadsRes.data as Lead[]) ?? []}
        closerKpis={(kpisRes.data as CloserKPI[]) ?? []}
        currentMemberId={session.team_member_id}
        currentName={session.nombre}
        objective={(objRes.data as ObjectiveData) ?? null}
      />
    );
  }

  if (isSetter) {
    const currentFiscalMonth = getFiscalMonth(getToday());
    const [reportsRes, leadsRes, objRes] = await Promise.all([
      supabase
        .from("daily_reports")
        .select("*")
        .eq("setter_id", session.team_member_id)
        .order("fecha", { ascending: false })
        .limit(30),
      supabase
        .from("leads")
        .select("*")
        .eq("setter_id", session.team_member_id),
      supabase
        .from("objectives")
        .select("*")
        .eq("team_member_id", session.team_member_id)
        .eq("mes_fiscal", currentFiscalMonth)
        .maybeSingle(),
    ]);

    return (
      <HomeSetter
        reports={reportsRes.data ?? []}
        leads={(leadsRes.data as Lead[]) ?? []}
        currentMemberId={session.team_member_id}
        currentName={session.nombre}
        objective={(objRes.data as ObjectiveData) ?? null}
      />
    );
  }

  // Fallback
  redirect("/clientes");
}
