import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import FunnelClient from "./FunnelClient";
import type { Lead, Payment, RenewalHistory, TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();

  const [leadsRes, paymentsRes, renewalsRes, teamRes] = await Promise.all([
    supabase
      .from("leads")
      .select("*, closer:team_members!leads_closer_id_fkey(id,nombre), setter:team_members!leads_setter_id_fkey(id,nombre)"),
    supabase.from("payments").select("*"),
    supabase.from("renewal_history").select("*"),
    supabase
      .from("team_members")
      .select("id,nombre,is_closer,is_setter")
      .eq("activo", true),
  ]);

  return (
    <FunnelClient
      leads={(leadsRes.data as Lead[]) ?? []}
      payments={(paymentsRes.data as Payment[]) ?? []}
      renewals={(renewalsRes.data as RenewalHistory[]) ?? []}
      team={(teamRes.data as TeamMember[]) ?? []}
    />
  );
}
