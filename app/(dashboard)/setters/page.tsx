import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import SettersClient from "./SettersClient";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const [leadsRes, paymentsRes, teamRes, campsRes] = await Promise.all([
    sb.from("leads").select("*, setter:team_members!leads_setter_id_fkey(id,nombre)").range(0, 4999),
    sb.from("payments").select("id, lead_id, monto_usd, fecha_pago, estado").eq("estado", "pagado").not("fecha_pago", "is", null).range(0, 4999),
    sb.from("team_members").select("id, nombre, is_setter, activo").eq("is_setter", true).eq("activo", true),
    sb.from("utm_campaigns").select("id, medium, source, content, setter_id"),
  ]);

  return (
    <SettersClient
      leads={(leadsRes.data as Lead[]) ?? []}
      payments={(paymentsRes.data as { id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }[]) ?? []}
      setters={(teamRes.data as { id: string; nombre: string }[]) ?? []}
      campaigns={(campsRes.data as { id: string; medium: string; source: string; content: string; setter_id: string | null }[]) ?? []}
    />
  );
}
