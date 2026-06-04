import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString } from "@/lib/date-utils";
import { getNichoFilter } from "@/lib/vista";
import { getNichoLeadIds } from "@/lib/queries/leads";
import ComisionesClient from "./ComisionesClient";

export const dynamic = "force-dynamic";

export default async function ComisionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isCloser = session.roles.includes("closer");
  const isSetter = session.roles.includes("setter");
  if (!session.is_admin && !isCloser && !isSetter) redirect("/");

  const sb = createServerClient();
  const fiscalStart = toDateString(getFiscalStart());
  const fiscalEnd = toDateString(getFiscalEnd());
  const nicho = await getNichoFilter();
  const leadIdsNicho = await getNichoLeadIds();

  let leadsQuery = sb.from("leads")
    .select("id, nombre, closer_id, setter_id, utm_medium, utm_source, utm_content, programa_pitcheado, email, telefono, instagram, fecha_agendado, fecha_llamada, estado, lead_calificado, ticket_total, plan_pago, concepto, fuente, notas_internas, reporte_general")
    .range(0, 9999);
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  const [paymentsRes, leadsRes, teamRes, campaignsRes] = await Promise.all([
    sb.from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor, es_renovacion, descuento_comision_closer_usd, descuento_comision_setter_usd, aplicado_en_comisiones_mes")
      .in("estado", ["pagado", "refund"])
      .range(0, 9999),
    leadsQuery,
    sb.from("team_members")
      .select("id, nombre, is_closer, is_setter")
      .eq("activo", true),
    sb.from("utm_campaigns").select("medium, setter_id"),
  ]);

  const paymentsRaw = (paymentsRes.data ?? []) as PaymentRow[];
  const payments = leadIdsNicho
    ? paymentsRaw.filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id))
    : paymentsRaw;

  return (
    <ComisionesClient
      payments={payments}
      leads={(leadsRes.data ?? []) as LeadLite[]}
      team={(teamRes.data ?? []) as TeamLite[]}
      campaigns={(campaignsRes.data ?? []) as CampaignLite[]}
      fiscalStart={fiscalStart}
      fiscalEnd={fiscalEnd}
      currentTeamMemberId={session.team_member_id}
      isAdmin={session.is_admin}
    />
  );
}

export interface PaymentRow {
  id: string;
  lead_id: string | null;
  monto_usd: number;
  fecha_pago: string | null;
  estado: string;
  numero_cuota: number;
  receptor: string | null;
  es_renovacion?: boolean;
  descuento_comision_closer_usd?: number | null;
  descuento_comision_setter_usd?: number | null;
  aplicado_en_comisiones_mes?: string | null;
}
export interface LeadLite {
  id: string;
  nombre: string;
  closer_id: string | null;
  setter_id: string | null;
  utm_medium: string | null;
  utm_source: string | null;
  utm_content: string | null;
  programa_pitcheado: string | null;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: string;
  lead_calificado: string | null;
  ticket_total: number;
  plan_pago: string | null;
  concepto: string | null;
  fuente: string | null;
  notas_internas: string | null;
  reporte_general: string | null;
}
export interface TeamLite { id: string; nombre: string; is_closer: boolean; is_setter: boolean }
export interface CampaignLite { medium: string | null; setter_id: string | null }
