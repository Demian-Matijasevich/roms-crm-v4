import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import ClosersClient from "./ClosersClient";
import type { CloserKPI, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClosersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const canAccess = session.is_admin || session.roles.includes("closer");
  if (!canAccess) redirect("/");

  const supabase = createServerClient();

  const [kpisRes, leadsRes, paymentsRes, teamRes, campaignsRes] = await Promise.all([
    supabase.from("v_closer_kpis").select("*"),
    supabase
      .from("leads")
      .select("id, nombre, estado, fecha_llamada, fecha_agendado, closer_id, setter_id, utm_medium, ticket_total, programa_pitcheado, lead_calificado, closer:team_members!leads_closer_id_fkey(*)")
      .range(0, 9999),
    supabase
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, estado")
      .eq("estado", "pagado")
      .not("fecha_pago", "is", null)
      .range(0, 9999),
    supabase.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true),
    supabase.from("utm_campaigns").select("medium, setter_id"),
  ]);

  return (
    <ClosersClient
      closerKpis={(kpisRes.data as CloserKPI[]) ?? []}
      leads={(leadsRes.data as unknown as Lead[]) ?? []}
      payments={(paymentsRes.data as { id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }[]) ?? []}
      team={(teamRes.data as { id: string; nombre: string; is_closer: boolean; is_setter: boolean }[]) ?? []}
      campaigns={(campaignsRes.data as { medium: string | null; setter_id: string | null }[]) ?? []}
    />
  );
}
