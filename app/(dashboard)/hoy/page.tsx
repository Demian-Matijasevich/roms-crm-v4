import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import HoyClient from "./HoyClient";

export const dynamic = "force-dynamic";

export default async function HoyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const sb = createServerClient();
  const [leadsRes, teamRes, campaignsRes] = await Promise.all([
    sb
      .from("leads")
      .select("id, nombre, fecha_agendado, fecha_llamada, estado, closer_id, setter_id, fuente, utm_source, utm_medium")
      .range(0, 9999),
    sb.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true),
    sb.from("utm_campaigns").select("medium, setter_id"),
  ]);

  return (
    <HoyClient
      leads={leadsRes.data ?? []}
      team={teamRes.data ?? []}
      campaigns={campaignsRes.data ?? []}
    />
  );
}
