import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import SettersClient from "./SettersClient";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Setters + admins pueden acceder; closers redirigen a home
  const canAccess = session.is_admin || session.roles.includes("setter");
  if (!canAccess) redirect("/");

  const sb = createServerClient();
  const nicho = await getNichoFilter();

  let leadIdsNicho: Set<string> | null = null;
  if (nicho) {
    const { data: leadsN } = await sb.from("leads").select("id").eq("nicho", nicho).range(0, 9999);
    leadIdsNicho = new Set((leadsN || []).map((l: { id: string }) => l.id));
  }

  const [leadsRes, paymentsRes, teamRes, campsRes] = await Promise.all([
    (() => {
      let q = sb.from("leads").select("*, setter:team_members!leads_setter_id_fkey(id,nombre)").range(0, 4999);
      if (nicho) q = q.eq("nicho", nicho);
      return q;
    })(),
    sb.from("payments").select("id, lead_id, monto_usd, fecha_pago, estado").eq("estado", "pagado").not("fecha_pago", "is", null).range(0, 4999),
    sb.from("team_members").select("id, nombre, is_setter, activo").eq("is_setter", true).eq("activo", true),
    sb.from("utm_campaigns").select("id, medium, source, content, setter_id"),
  ]);

  // Filtrar payments por leadIdsNicho (post-filter)
  const paymentsRaw = (paymentsRes.data as { id: string; lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }[]) ?? [];
  const paymentsFiltered = leadIdsNicho
    ? paymentsRaw.filter((p) => p.lead_id && leadIdsNicho!.has(p.lead_id))
    : paymentsRaw;

  return (
    <SettersClient
      leads={(leadsRes.data as Lead[]) ?? []}
      payments={paymentsFiltered}
      setters={(teamRes.data as { id: string; nombre: string }[]) ?? []}
      campaigns={(campsRes.data as { id: string; medium: string; source: string; content: string; setter_id: string | null }[]) ?? []}
    />
  );
}
