import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, getFiscalMonth, getToday, toDateString } from "@/lib/date-utils";
import type { ObjectiveData } from "./HomeCloser";
import { getUsdRate } from "@/lib/queries/settings";
import { computeTeamCommissions } from "@/lib/commissions";
import HomeAdmin from "./HomeAdmin";
import HomeAdminPolitica from "./HomeAdminPolitica";
import HomeCloser from "./HomeCloser";
import HomeSetter from "./HomeSetter";
import HomeCobranzas from "./HomeCobranzas";
import { getNichoFilter, getVista } from "@/lib/vista";
import { computeMonthlyCash } from "@/lib/queries/monthly-cash";
import type { MonthlyCash, Payment, Client, Lead, CloserKPI, Commission, RenewalQueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();

  // Cobranzas (Mel típico): si es is_cobranzas Y NO es jefe de ventas → home cobranzas
  // Incluso si es admin, prioriza la vista de cobranzas porque es lo que más usa.
  if (session.roles.includes("cobranzas") && !session.is_jefe_ventas) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const startWeek = new Date(today);
    startWeek.setDate(today.getDate() - today.getDay() + 1); // lunes
    const startWeekStr = startWeek.toISOString().slice(0, 10);
    const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endWeek = new Date(startWeek);
    endWeek.setDate(startWeek.getDate() + 6);
    const endWeekStr = endWeek.toISOString().slice(0, 10);

    const nicho = await getNichoFilter();
    let leadsQ = supabase.from("leads").select("id, nombre, telefono, nicho").range(0, 9999);
    if (nicho) leadsQ = leadsQ.eq("nicho", nicho);
    const { data: leadsAll } = await leadsQ;
    const leadIdsAllowed = nicho ? new Set((leadsAll || []).map((l: { id: string }) => l.id)) : null;
    const leadByIdMap = new Map((leadsAll || []).map((l: { id: string; nombre: string | null; telefono: string | null }) => [l.id, l]));

    const { data: pendientesAll } = await supabase
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_vencimiento, numero_cuota, snoozed_until, snooze_count")
      .eq("estado", "pendiente")
      .not("fecha_vencimiento", "is", null)
      .range(0, 9999);
    const pendientes = (pendientesAll || []).filter((p) => p.lead_id && (!leadIdsAllowed || leadIdsAllowed.has(p.lead_id)));

    const mapCuota = (p: { id: string; lead_id: string | null; monto_usd: number; fecha_vencimiento: string | null; numero_cuota: number; snoozed_until: string | null; snooze_count: number | null }) => {
      const lead = p.lead_id ? leadByIdMap.get(p.lead_id) : null;
      return {
        id: p.id,
        lead_id: p.lead_id,
        monto_usd: Number(p.monto_usd || 0),
        fecha_vencimiento: p.fecha_vencimiento,
        numero_cuota: p.numero_cuota,
        snoozed_until: p.snoozed_until,
        snooze_count: p.snooze_count || 0,
        lead_nombre: (lead as { nombre?: string } | undefined)?.nombre || "(s/n)",
        lead_telefono: (lead as { telefono?: string } | undefined)?.telefono || null,
      };
    };

    const cuotasHoy = pendientes.filter((p) => p.fecha_vencimiento === todayStr).map(mapCuota);
    const cuotasSemana = pendientes
      .filter((p) => p.fecha_vencimiento && p.fecha_vencimiento >= todayStr && p.fecha_vencimiento <= endWeekStr)
      .sort((a, b) => (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || ""))
      .map(mapCuota);
    const cuotasAtrasadas = pendientes
      .filter((p) => p.fecha_vencimiento && p.fecha_vencimiento < todayStr && (!p.snoozed_until || p.snoozed_until < todayStr))
      .sort((a, b) => (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || ""))
      .map(mapCuota);

    // Pagados hoy/semana/mes
    const { data: pagadosAll } = await supabase
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, metodo_pago, lead:leads!payments_lead_id_fkey(nombre)")
      .eq("estado", "pagado")
      .gte("fecha_pago", startMonth)
      .lte("fecha_pago", todayStr)
      .range(0, 999);
    const pagadosFiltrados = (pagadosAll || []).filter((p) => p.lead_id && (!leadIdsAllowed || leadIdsAllowed.has(p.lead_id)));

    const mapPago = (p: { id: string; monto_usd: number; fecha_pago: string | null; metodo_pago: string | null; lead?: unknown }) => ({
      id: p.id,
      monto_usd: Number(p.monto_usd || 0),
      fecha_pago: p.fecha_pago || "",
      cliente: (Array.isArray(p.lead) ? (p.lead[0] as { nombre?: string } | undefined)?.nombre : (p.lead as { nombre?: string } | null)?.nombre) || "(s/n)",
      metodo_pago: p.metodo_pago,
    });
    const pagadasHoy = pagadosFiltrados.filter((p) => p.fecha_pago === todayStr).map(mapPago);
    const pagadasMes = pagadosFiltrados.map(mapPago);
    const cashHoy = pagadasHoy.reduce((s, p) => s + p.monto_usd, 0);
    const cashSemana = pagadosFiltrados.filter((p) => p.fecha_pago && p.fecha_pago >= startWeekStr).reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const cashMes = pagadasMes.reduce((s, p) => s + p.monto_usd, 0);

    const { data: rate } = await supabase.from("team_members").select("observaciones").eq("nombre", "__SYSTEM_CONFIG__").maybeSingle();
    let usdRate = 1250;
    if (rate?.observaciones) {
      try { const s = JSON.parse(rate.observaciones); if (Number(s.usd_ars_rate)) usdRate = Number(s.usd_ars_rate); } catch {}
    }

    return (
      <HomeCobranzas
        nombre={session.nombre}
        cuotasHoy={cuotasHoy}
        cuotasSemana={cuotasSemana}
        cuotasAtrasadas={cuotasAtrasadas}
        pagadasHoy={pagadasHoy}
        pagadasMes={pagadasMes}
        cashHoy={cashHoy}
        cashSemana={cashSemana}
        cashMes={cashMes}
        usdRate={usdRate}
        todayStr={todayStr}
      />
    );
  }

  if (session.is_admin) {
    // Fetch admin data
    const fiscalStart = getFiscalStart();
    const fiscalEnd = getFiscalEnd();
    const today = toDateString(getToday());
    const nicho = await getNichoFilter();

    // Leads del nicho (todos los leads si vista=todos)
    let leadsNichoQuery = supabase.from("leads").select("id, ticket_total, nicho").range(0, 9999);
    if (nicho) leadsNichoQuery = leadsNichoQuery.eq("nicho", nicho);
    const { data: leadsNichoRows } = await leadsNichoQuery;
    const leadsNichoList = (leadsNichoRows ?? []) as Array<{ id: string; ticket_total: number }>;
    const leadIdsNicho = nicho ? new Set(leadsNichoList.map((l) => l.id)) : null;

    const [cashRes, paymentsRes, overdueRes, atRiskRes, commissionsRes, pendingPaymentsRes, pipelineLeadsRes, renewalQueueRes, leadsForCommRes, teamRes, campaignsRes] = await Promise.all([
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
        .select("monto_usd, lead_id")
        .eq("estado", "pendiente")
        .gte("fecha_vencimiento", toDateString(fiscalStart))
        .lte("fecha_vencimiento", toDateString(fiscalEnd)),
      // Revenue prediction: pipeline leads (filtrado por nicho si aplica)
      (() => {
        let q = supabase.from("leads").select("id, nombre, ticket_total, estado, nicho").in("estado", ["pendiente", "seguimiento", "reserva"]);
        if (nicho) q = q.eq("nicho", nicho);
        return q;
      })(),
      // Revenue prediction: renewal queue
      supabase
        .from("v_renewal_queue")
        .select("*")
        .in("semaforo", ["urgente", "proximo"]),
      // Leads para cálculo de comisiones (filtrado por nicho si aplica)
      (() => {
        let q = supabase.from("leads").select("id, closer_id, setter_id, utm_medium, programa_pitcheado, nicho").range(0, 9999);
        if (nicho) q = q.eq("nicho", nicho);
        return q;
      })(),
      supabase
        .from("team_members")
        .select("id, nombre, is_closer, is_setter")
        .eq("activo", true),
      supabase
        .from("utm_campaigns")
        .select("medium, setter_id"),
    ]);

    // Aplicar filtro de nicho a todos los datasets que vienen de v_* o sin filtro
    const allPayments = (paymentsRes.data ?? []) as Payment[];
    const allOverdue = (overdueRes.data ?? []) as Payment[];
    const allAtRisk = (atRiskRes.data ?? []) as Client[];
    const allCash = (cashRes.data as MonthlyCash[] ?? []);
    const allCommissions = (commissionsRes.data as Commission[] ?? []);
    const allRenewals = (renewalQueueRes.data as RenewalQueueRow[] ?? []);
    const allPendingPayments = (pendingPaymentsRes.data ?? []) as Array<{ monto_usd: number; lead_id: string | null }>;

    // Filtrados por nicho (si aplica)
    const payments = leadIdsNicho ? allPayments.filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id)) : allPayments;
    const overduePayments = leadIdsNicho ? allOverdue.filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id)) : allOverdue;
    const atRiskClients = leadIdsNicho ? allAtRisk.filter((c) => c.lead_id && leadIdsNicho.has(c.lead_id)) : allAtRisk;
    const pendingPayments = leadIdsNicho ? allPendingPayments.filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id)) : allPendingPayments;

    // monthlyCash: si hay filtro, recomputar desde payments + leadsNicho; sino, usar la vista
    const monthlyCash: MonthlyCash[] = leadIdsNicho
      ? computeMonthlyCash(payments as never[], leadsNichoList)
      : allCash;

    // commissions: las comisiones por persona ya están agregadas globales en v_commissions.
    // Si hay filtro de nicho, dejamos las comisiones de la vista (es el cálculo total real de cada persona).
    // Comisiones por nicho se podrían recomputar también, pero para Fase 1 lo dejamos así.
    const commissions = allCommissions;

    // renewalQueue: la vista v_renewal_queue usa client.id como id.
    // Si hay nicho, filtramos por los client.id cuyo lead pertenece al nicho.
    let renewals: RenewalQueueRow[] = allRenewals;
    if (leadIdsNicho) {
      const { data: clientsNicho } = await supabase
        .from("clients")
        .select("id, lead_id")
        .in("lead_id", Array.from(leadIdsNicho));
      const clientIdsNicho = new Set((clientsNicho ?? []).map((c) => c.id));
      renewals = allRenewals.filter((r) => clientIdsNicho.has((r as unknown as { id: string }).id));
    }

    // Revenue prediction calculations (todo basado en data filtrada por nicho)
    const currentFiscalLabel = getFiscalMonth(getToday());
    const currentCash = monthlyCash.find(m => m.mes_fiscal === currentFiscalLabel);
    const cashCollected = currentCash?.cash_total ?? 0;
    const pendingPaymentsTotal = pendingPayments.reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const pipelineLeads = (pipelineLeadsRes.data ?? []) as Pick<Lead, "id" | "nombre" | "ticket_total" | "estado">[];
    const pipelineTotal = pipelineLeads.reduce((s, l) => s + (l.ticket_total || 0), 0);
    const renewalQueue = renewals;

    // Build commissions using Valen scheme (7/5/7 × multiplier, cap 10%) + setter 3%
    // Fiscal month range = calendar month for ROMS
    const fiscalMonthStart = toDateString(fiscalStart);
    const fiscalMonthEnd = toDateString(fiscalEnd);
    const currentCommissions = computeTeamCommissions({
      leads: (leadsForCommRes.data ?? []) as Array<{ id: string; closer_id: string | null; setter_id: string | null; utm_medium: string | null; programa_pitcheado: string | null }>,
      payments: payments as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>,
      team: (teamRes.data ?? []) as Array<{ id: string; nombre: string; is_closer: boolean; is_setter: boolean }>,
      campaigns: (campaignsRes.data ?? []) as Array<{ medium: string | null; setter_id: string | null }>,
      monthStart: fiscalMonthStart,
      monthEnd: fiscalMonthEnd,
    });

    // Facturación del mes (criterio contable, mismo que /finanzas y /cierre-mes):
    // ticket_total de leads cuya cuota#1 se cobró en el mes.
    const leadsCuota1Mes = new Set<string>();
    for (const p of payments) {
      if (p.estado !== "pagado") continue;
      if (!p.lead_id || !p.fecha_pago) continue;
      if (p.numero_cuota !== 1) continue;
      const f = p.fecha_pago.split("T")[0];
      if (f < fiscalMonthStart || f > fiscalMonthEnd) continue;
      leadsCuota1Mes.add(p.lead_id);
    }
    const { data: leadsForVentasRows } = await supabase
      .from("leads")
      .select("id, ticket_total")
      .in("id", Array.from(leadsCuota1Mes));
    const ventasFirmadas = ((leadsForVentasRows ?? []) as Array<{ id: string; ticket_total: number }>)
      .reduce((s, l) => s + (l.ticket_total || 0), 0);

    const vista = await getVista();
    const isPolitica = vista === "politica";
    const Home = isPolitica ? HomeAdminPolitica : HomeAdmin;
    return (
      <Home
        monthlyCash={monthlyCash}
        payments={payments}
        overduePayments={overduePayments}
        atRiskClients={atRiskClients}
        commissions={commissions}
        teamCommissions={currentCommissions}
        ventasFirmadasOverride={ventasFirmadas}
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
    const [leadsRes, kpisRes, objRes, usdRate] = await Promise.all([
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
      getUsdRate(),
    ]);

    return (
      <HomeCloser
        leads={(leadsRes.data as Lead[]) ?? []}
        closerKpis={(kpisRes.data as CloserKPI[]) ?? []}
        currentMemberId={session.team_member_id}
        currentName={session.nombre}
        usdRate={usdRate}
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
