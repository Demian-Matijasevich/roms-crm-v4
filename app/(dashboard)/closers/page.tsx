import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import ClosersClient from "./ClosersClient";
import type { CloserKPI, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClosersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();

  const [kpisRes, leadsRes, commissionsRes] = await Promise.all([
    supabase.from("v_closer_kpis").select("*"),
    supabase
      .from("leads")
      .select("*, closer:team_members!leads_closer_id_fkey(*)")
      .not("closer_id", "is", null),
    supabase.from("v_commissions").select("*"),
  ]);

  return (
    <ClosersClient
      closerKpis={(kpisRes.data as CloserKPI[]) ?? []}
      leads={(leadsRes.data as Lead[]) ?? []}
      commissions={commissionsRes.data ?? []}
    />
  );
}
