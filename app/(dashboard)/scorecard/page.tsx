import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getToday } from "@/lib/date-utils";
import ScorecardClient from "./ScorecardClient";
import type { Lead, Payment, TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ScorecardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();

  // Calculate last 2 weeks (Mon-Sun)
  const now = getToday();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // This week's Monday
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysSinceMonday);
  thisMonday.setHours(0, 0, 0, 0);

  // Last week's Monday
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  // Two weeks ago Monday
  const twoWeeksAgoMonday = new Date(lastMonday);
  twoWeeksAgoMonday.setDate(lastMonday.getDate() - 7);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const [leadsRes, paymentsRes, teamRes] = await Promise.all([
    supabase
      .from("leads")
      .select("*, closer:team_members!leads_closer_id_fkey(id,nombre), setter:team_members!leads_setter_id_fkey(id,nombre)")
      .gte("fecha_llamada", fmt(twoWeeksAgoMonday))
      .lt("fecha_llamada", fmt(thisMonday)),
    supabase
      .from("payments")
      .select("*")
      .gte("fecha_pago", fmt(twoWeeksAgoMonday))
      .lt("fecha_pago", fmt(thisMonday)),
    supabase
      .from("team_members")
      .select("id,nombre,is_closer,is_setter")
      .eq("activo", true),
  ]);

  return (
    <ScorecardClient
      leads={(leadsRes.data as Lead[]) ?? []}
      payments={(paymentsRes.data as Payment[]) ?? []}
      team={(teamRes.data as TeamMember[]) ?? []}
      lastMondayStr={fmt(lastMonday)}
      twoWeeksAgoMondayStr={fmt(twoWeeksAgoMonday)}
      thisMondayStr={fmt(thisMonday)}
    />
  );
}
