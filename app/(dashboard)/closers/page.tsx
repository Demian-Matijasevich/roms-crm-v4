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

  const [kpisRes, leadsRes, commissionsRes, paymentsRes, teamRes] = await Promise.all([
    supabase.from("v_closer_kpis").select("*"),
    supabase
      .from("leads")
      .select("*, closer:team_members!leads_closer_id_fkey(*)")
      .not("closer_id", "is", null)
      .range(0, 4999),
    supabase.from("v_commissions").select("*"),
    supabase
      .from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, estado")
      .eq("estado", "pagado")
      .not("fecha_pago", "is", null)
      .range(0, 4999),
    supabase.from("team_members").select("id, nombre, is_closer").eq("is_closer", true).eq("activo", true),
  ]);

  return (
    <ClosersClient
      closerKpis={(kpisRes.data as CloserKPI[]) ?? []}
      leads={(leadsRes.data as Lead[]) ?? []}
      commissions={commissionsRes.data ?? []}
      payments={(paymentsRes.data as { id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }[]) ?? []}
      team={(teamRes.data as { id: string; nombre: string; is_closer: boolean }[]) ?? []}
    />
  );
}
