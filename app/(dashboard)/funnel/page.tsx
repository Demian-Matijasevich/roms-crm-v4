import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import { getNichoLeadIds } from "@/lib/queries/leads";
import FunnelClient from "./FunnelClient";
import type { Lead, Payment, RenewalHistory, TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();
  const nicho = await getNichoFilter();
  const leadIdsNicho = await getNichoLeadIds();

  let leadsQuery = supabase
    .from("leads")
    .select("*, closer:team_members!leads_closer_id_fkey(id,nombre), setter:team_members!leads_setter_id_fkey(id,nombre)");
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  const [leadsRes, paymentsRes, renewalsRes, teamRes] = await Promise.all([
    leadsQuery,
    supabase.from("payments").select("*"),
    supabase.from("renewal_history").select("*"),
    supabase
      .from("team_members")
      .select("id,nombre,is_closer,is_setter")
      .eq("activo", true),
  ]);

  const paymentsRaw = (paymentsRes.data as Payment[]) ?? [];
  const payments = leadIdsNicho
    ? paymentsRaw.filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id))
    : paymentsRaw;

  // renewal_history.client_id apunta a clients — necesitamos clients del nicho para filtrar
  let renewals = (renewalsRes.data as RenewalHistory[]) ?? [];
  if (leadIdsNicho) {
    const { data: cs } = await supabase
      .from("clients")
      .select("id, lead_id")
      .in("lead_id", Array.from(leadIdsNicho).length > 0 ? Array.from(leadIdsNicho) : ["00000000-0000-0000-0000-000000000000"]);
    const clientIdsNicho = new Set((cs || []).map((c: { id: string }) => c.id));
    renewals = renewals.filter((r) => r.client_id && clientIdsNicho.has(r.client_id));
  }

  return (
    <FunnelClient
      leads={(leadsRes.data as Lead[]) ?? []}
      payments={payments}
      renewals={renewals}
      team={(teamRes.data as TeamMember[]) ?? []}
    />
  );
}
