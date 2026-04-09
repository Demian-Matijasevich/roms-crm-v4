import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalMonth, getToday } from "@/lib/date-utils";
import LeaderboardClient from "./LeaderboardClient";
import type { Lead, AtCommission, Commission } from "@/lib/types";
import type { ObjectiveData } from "./LeaderboardClient";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();
  const currentFiscalMonth = getFiscalMonth(getToday());

  const [leadsRes, commRes, objRes] = await Promise.all([
    supabase
      .from("leads")
      .select("*, closer:team_members!leads_closer_id_fkey(*)")
      .not("closer_id", "is", null),
    supabase
      .from("v_commissions")
      .select("*")
      .eq("mes_fiscal", currentFiscalMonth),
    supabase
      .from("objectives")
      .select("*")
      .eq("mes_fiscal", currentFiscalMonth),
  ]);

  // Map v_commissions to AtCommission format
  const commissions: AtCommission[] = ((commRes.data ?? []) as Commission[]).map(c => ({
    id: c.team_member_id,
    nombre: c.nombre,
    comision_closer: c.comision_closer,
    comision_setter: c.comision_setter,
    comision_total: c.comision_total,
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
