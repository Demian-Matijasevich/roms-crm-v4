import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchTeamMembers, fetchPaymentMethods } from "@/lib/queries/admin";
import { createServerClient } from "@/lib/supabase-server";
import AdminClient from "./AdminClient";
import type { Objective } from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await requireAdmin();
  if ("error" in auth) redirect("/login");

  const supabase = createServerClient();

  const [team, paymentMethods, objectivesRes] = await Promise.all([
    fetchTeamMembers(),
    fetchPaymentMethods(),
    supabase
      .from("objectives")
      .select("*, team_member:team_members(id,nombre)")
      .order("mes_fiscal", { ascending: false }),
  ]);

  return (
    <AdminClient
      team={team}
      paymentMethods={paymentMethods}
      objectives={(objectivesRes.data as Objective[]) ?? []}
    />
  );
}
