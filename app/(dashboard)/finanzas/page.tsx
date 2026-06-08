import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalMonth, getToday } from "@/lib/date-utils";
import { getUsdRate } from "@/lib/queries/settings";
import { getNichoFilter } from "@/lib/vista";
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
  const nicho = await getNichoFilter();

  // Si hay vista filtrada, calcular set de lead_ids del nicho
  let leadIdsNicho: Set<string> | null = null;
  if (nicho) {
    const { data: leadsN } = await supabase.from("leads").select("id").eq("nicho", nicho).range(0, 9999);
    leadIdsNicho = new Set((leadsN || []).map((l: { id: string }) => l.id));
  }

  let leadsForCommQuery = supabase
    .from("leads")
    .select("id, nombre, closer_id, setter_id, utm_medium, programa_pitcheado, ticket_total, estado, fecha_llamada")
    .range(0, 9999);
  if (nicho) leadsForCommQuery = leadsForCommQuery.eq("nicho", nicho);

  const [monthlyCashRes, treasuryRes, gastosRes, paymentsRes, ingresosRes, leadsForCommRes, teamRes, campaignsRes, usdRate] =
    await Promise.all([
      // v_monthly_cash_by_nicho cuando hay filtro; sino la vista global histórica.
      nicho
        ? supabase.from("v_monthly_cash_by_nicho").select("*").eq("nicho", nicho)
        : supabase.from("v_monthly_cash").select("*"),
      // v_treasury_by_nicho cuando hay filtro; sino la global.
      nicho
        ? supabase.from("v_treasury_by_nicho").select("*").eq("nicho", nicho)
        : supabase.from("v_treasury").select("*"),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }),
      supabase
        .from("payments")
        .select("id, lead_id, monto_usd, monto_ars, receptor, fecha_pago, estado, metodo_pago, numero_cuota")
        .eq("estado", "pagado"),
      supabase
        .from("payments")
        .select("id, lead_id, monto_usd, monto_ars, fecha_pago, numero_cuota, metodo_pago, receptor, es_renovacion, lead:leads!payments_lead_id_fkey(nombre)")
        .eq("estado", "pagado")
        .not("fecha_pago", "is", null)
        .order("fecha_pago", { ascending: false })
        .range(0, 4999),
      leadsForCommQuery,
      supabase
        .from("team_members")
        .select("id, nombre, is_closer, is_setter")
        .eq("activo", true),
      supabase.from("utm_campaigns").select("medium, setter_id"),
      getUsdRate(),
    ]);

  // Clients para revenue devengado + lista combinada con leads para modal refund
  let clientsQuery = supabase
    .from("clients")
    .select("id, lead_id, nombre, programa, fecha_onboarding, fecha_offboarding, total_dias_programa, estado")
    .not("fecha_onboarding", "is", null)
    .range(0, 4999);
  if (leadIdsNicho) {
    const ids = Array.from(leadIdsNicho);
    clientsQuery = clientsQuery.in("lead_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const clientsRes = await clientsQuery;

  // USD rate history para mostrar/editar en finanzas
  const usdRatesRes = await supabase.from("usd_rate_history").select("*").order("mes", { ascending: false });

  // Refunds — punto 7 audit Iñaki: payments con estado refund + ticket inicial del lead
  const refundsRes = await supabase
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, receptor, descuento_comision_closer_usd, descuento_comision_setter_usd, lead:leads!payments_lead_id_fkey(nombre, ticket_total)")
    .eq("estado", "refund")
    .order("fecha_pago", { ascending: false });

  const refunds: RefundRow[] = ((refundsRes.data as unknown[]) ?? []).map((r) => {
    const p = r as Record<string, unknown>;
    const lead = p.lead as Record<string, unknown> | null;
    return {
      id: p.id as string,
      lead_id: (p.lead_id as string) || null,
      lead_nombre: (lead?.nombre as string) || null,
      ticket_inicial: (lead?.ticket_total as number) || 0,
      monto: (p.monto_usd as number) || 0,
      fecha: (p.fecha_pago as string) || "",
      receptor: (p.receptor as string) || null,
      descuento_closer: Number(p.descuento_comision_closer_usd || 0),
      descuento_setter: Number(p.descuento_comision_setter_usd || 0),
    };
  });

  // Compute commissions per month using Valen scheme (7/5/7 × multiplicador, cap 10%) + setter 3%
  const allPaymentsRaw = (paymentsRes.data ?? []) as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>;
  const allPayments = leadIdsNicho
    ? allPaymentsRaw.filter((p) => p.lead_id && leadIdsNicho!.has(p.lead_id))
    : allPaymentsRaw;
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

  const ingresosRaw = ((ingresosRes.data as unknown[]) ?? []).map((r) => {
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
  const ingresos = leadIdsNicho
    ? ingresosRaw.filter((i) => i.lead_id && leadIdsNicho!.has(i.lead_id))
    : ingresosRaw;
  // Refunds también filtrados
  const refundsFiltered = leadIdsNicho
    ? refunds.filter((r) => r.lead_id && leadIdsNicho!.has(r.lead_id))
    : refunds;

  // Pro metrics: leads cerrados con info de venta + clients para revenue devengado
  const leadsForPro = leadsForComm.map((l) => ({
    id: l.id,
    nombre: (l as { nombre?: string }).nombre ?? null,
    programa_pitcheado: l.programa_pitcheado,
    ticket_total: (l as { ticket_total?: number }).ticket_total ?? 0,
    estado: (l as { estado?: string }).estado ?? null,
    fecha_llamada: (l as { fecha_llamada?: string | null }).fecha_llamada ?? null,
  }));
  // Trae todos los clients (con o sin onboarding) — para el lookup del modal refund
  // necesitamos también los activos sin onboarding cargado.
  const allClientsRes = await supabase
    .from("clients")
    .select("id, lead_id, nombre, programa, estado")
    .range(0, 9999);

  const clientsForPro = ((clientsRes.data ?? []) as Array<{
    id: string;
    lead_id: string | null;
    nombre?: string | null;
    programa: string | null;
    fecha_onboarding: string | null;
    fecha_offboarding: string | null;
    total_dias_programa: number;
    estado: string;
  }>);

  // Lista combinada lead+client para el modal refund: cubre el caso donde el
  // nombre del cliente no coincide con el lead (ej. lead "Martin Miño" pero
  // cliente "Emilia Lopez"). El modal usa lead_id como ID del payment.
  const allClients = ((allClientsRes.data ?? []) as Array<{
    id: string;
    lead_id: string | null;
    nombre: string | null;
    programa: string | null;
    estado: string;
  }>);
  const leadNombreById = new Map(leadsForPro.map((l) => [l.id, l.nombre || ""]));
  const refundLeadOptions: Array<{ id: string; nombre: string }> = [];
  const refundSeenIds = new Set<string>();
  // Primero todos los leads (orden alfabético natural)
  for (const l of leadsForPro) {
    if (!l.id) continue;
    refundSeenIds.add(l.id);
    refundLeadOptions.push({ id: l.id, nombre: l.nombre || "(sin nombre)" });
  }
  // Después clients cuyo nombre difiere del lead → agregar como entrada con "Cliente — lead: ..."
  for (const c of allClients) {
    if (!c.lead_id || !c.nombre) continue;
    const leadNombre = leadNombreById.get(c.lead_id) || "";
    const sameName = leadNombre && leadNombre.trim().toLowerCase() === c.nombre.trim().toLowerCase();
    if (sameName) continue;
    // Agregar como entrada con nombre del cliente — incluso si el lead_id ya existe en la lista,
    // queremos que aparezca también por su nombre de cliente.
    const label = leadNombre ? `${c.nombre} (lead: ${leadNombre})` : c.nombre;
    refundLeadOptions.push({ id: c.lead_id, nombre: label });
  }

  return (
    <FinanzasClient
      monthlyCash={(monthlyCashRes.data as MonthlyCash[]) ?? []}
      commissions={commissions}
      treasury={(treasuryRes.data as TreasuryRow[]) ?? []}
      gastos={(gastosRes.data as GastoRow[]) ?? []}
      ingresos={ingresos}
      usdRate={usdRate}
      payments={(() => {
        const raw = (paymentsRes.data as {
          id: string;
          monto_usd: number;
          receptor: string | null;
          fecha_pago: string | null;
          estado: string;
          metodo_pago: string | null;
          lead_id?: string | null;
        }[]) ?? [];
        return leadIdsNicho ? raw.filter((p) => p.lead_id && leadIdsNicho!.has(p.lead_id)) : raw;
      })()}
      leadsForPro={leadsForPro}
      clientsForPro={clientsForPro}
      refundLeadOptions={refundLeadOptions}
      usdRateHistory={(usdRatesRes.data ?? []) as Array<{ mes: string; rate: number }>}
      currentFiscalMonth={currentFiscalMonth}
      refunds={refundsFiltered}
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

export interface RefundRow {
  id: string;
  lead_id: string | null;
  lead_nombre: string | null;
  ticket_inicial: number;
  monto: number;
  fecha: string;
  receptor: string | null;
  descuento_closer: number;
  descuento_setter: number;
}
