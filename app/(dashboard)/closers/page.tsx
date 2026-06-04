import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import { getNichoLeadIds } from "@/lib/queries/leads";
import ClosersClient from "./ClosersClient";
import type { CloserKPI, Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClosersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const canAccess = session.is_admin || session.roles.includes("closer");
  if (!canAccess) redirect("/");

  const supabase = createServerClient();
  const nicho = await getNichoFilter();
  const leadIdsNicho = await getNichoLeadIds();

  let leadsQuery = supabase
    .from("leads")
    .select("id, nombre, estado, fecha_llamada, fecha_agendado, closer_id, setter_id, utm_medium, ticket_total, programa_pitcheado, lead_calificado, closer:team_members!leads_closer_id_fkey(*)")
    .range(0, 9999);
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  const [kpisRes, leadsRes, paymentsRes, teamRes, campaignsRes] = await Promise.all([
    // v_closer_kpis_by_nicho cuando hay filtro; sino la global.
    nicho
      ? supabase.from("v_closer_kpis_by_nicho").select("*").eq("nicho", nicho)
      : supabase.from("v_closer_kpis").select("*"),
    leadsQuery,
    supabase
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, estado")
      .eq("estado", "pagado")
      .not("fecha_pago", "is", null)
      .range(0, 9999),
    supabase.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true),
    supabase.from("utm_campaigns").select("medium, setter_id"),
  ]);

  const paymentsRaw = (paymentsRes.data ?? []) as Array<{ id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>;
  const payments = leadIdsNicho
    ? paymentsRaw.filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id))
    : paymentsRaw;

  return (
    <ClosersClient
      closerKpis={(kpisRes.data as CloserKPI[]) ?? []}
      leads={(leadsRes.data as unknown as Lead[]) ?? []}
      payments={payments}
      team={(teamRes.data as { id: string; nombre: string; is_closer: boolean; is_setter: boolean }[]) ?? []}
      campaigns={(campaignsRes.data as { medium: string | null; setter_id: string | null }[]) ?? []}
    />
  );
}
