import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString } from "@/lib/date-utils";
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

  const [paymentsRes, leadsRes, teamRes, campaignsRes] = await Promise.all([
    sb.from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor")
      .eq("estado", "pagado")
      .range(0, 9999),
    sb.from("leads")
      .select("id, nombre, closer_id, setter_id, utm_medium, programa_pitcheado")
      .range(0, 9999),
    sb.from("team_members")
      .select("id, nombre, is_closer, is_setter")
      .eq("activo", true),
    sb.from("utm_campaigns").select("medium, setter_id"),
  ]);

  return (
    <ComisionesClient
      payments={(paymentsRes.data ?? []) as PaymentRow[]}
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
}
export interface LeadLite {
  id: string;
  nombre: string;
  closer_id: string | null;
  setter_id: string | null;
  utm_medium: string | null;
  programa_pitcheado: string | null;
}
export interface TeamLite { id: string; nombre: string; is_closer: boolean; is_setter: boolean }
export interface CampaignLite { medium: string | null; setter_id: string | null }
