import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalMonth, getFiscalStart, getFiscalEnd, getToday, toDateString } from "@/lib/date-utils";
import { computeTeamCommissions } from "@/lib/commissions";
import { getNichoFilter } from "@/lib/vista";
import LeaderboardClient from "./LeaderboardClient";
import type { Lead, AtCommission } from "@/lib/types";
import type { ObjectiveData } from "./LeaderboardClient";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();
  const nicho = await getNichoFilter();
  const currentFiscalMonth = getFiscalMonth(getToday());
  const fiscalStart = toDateString(getFiscalStart());
  const fiscalEnd = toDateString(getFiscalEnd());

  let leadIdsNicho: Set<string> | null = null;
  if (nicho) {
    const { data: leadsN } = await supabase.from("leads").select("id").eq("nicho", nicho).range(0, 9999);
    leadIdsNicho = new Set((leadsN || []).map((l: { id: string }) => l.id));
  }

  const [leadsRes, paymentsRes, teamRes, campaignsRes, allLeadsRes, objRes] = await Promise.all([
    (() => {
      let q = supabase
        .from("leads")
        .select("*, closer:team_members!leads_closer_id_fkey(*)")
        .not("closer_id", "is", null);
      if (nicho) q = q.eq("nicho", nicho);
      return q;
    })(),
    supabase
      .from("payments")
      .select("lead_id, monto_usd, fecha_pago, estado")
      .eq("estado", "pagado"),
    supabase
      .from("team_members")
      .select("id, nombre, is_closer, is_setter")
      .eq("activo", true),
    supabase.from("utm_campaigns").select("medium, setter_id"),
    (() => {
      let q = supabase
        .from("leads")
        .select("id, closer_id, setter_id, utm_medium, programa_pitcheado")
        .range(0, 9999);
      if (nicho) q = q.eq("nicho", nicho);
      return q;
    })(),
    supabase
      .from("objectives")
      .select("*")
      .eq("mes_fiscal", currentFiscalMonth),
  ]);

  // Filtrar payments por leadIdsNicho (post-filter)
  const paymentsRaw = (paymentsRes.data ?? []) as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>;
  const paymentsFiltered = leadIdsNicho
    ? paymentsRaw.filter((p) => p.lead_id && leadIdsNicho!.has(p.lead_id))
    : paymentsRaw;

  // Compute commissions usando el esquema Valen (mismo que en /finanzas y dashboard)
  const rows = computeTeamCommissions({
    leads: (allLeadsRes.data ?? []) as Array<{ id: string; closer_id: string | null; setter_id: string | null; utm_medium: string | null; programa_pitcheado: string | null }>,
    payments: paymentsFiltered,
    team: (teamRes.data ?? []) as Array<{ id: string; nombre: string; is_closer: boolean; is_setter: boolean }>,
    campaigns: (campaignsRes.data ?? []) as Array<{ medium: string | null; setter_id: string | null }>,
    monthStart: fiscalStart,
    monthEnd: fiscalEnd,
  });

  const commissions: AtCommission[] = rows.map(r => ({
    id: r.id,
    nombre: r.nombre,
    comision_closer: r.comision_closer,
    comision_setter: r.comision_setter,
    comision_total: r.comision_total,
  }));

  return (
    <LeaderboardClient
      leads={(leadsRes.data as Lead[]) ?? []}
      currentMemberId={session.team_member_id}
      commissions={commissions}
      objectives={(objRes.data as ObjectiveData[]) ?? []}
    />
  );
}
