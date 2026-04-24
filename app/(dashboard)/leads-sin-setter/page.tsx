import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import LeadsSinSetterClient from "./LeadsSinSetterClient";

export const dynamic = "force-dynamic";

export default async function LeadsSinSetterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Acceso: admin, setter, o cualquiera autenticado (para reclamar leads propios)
  const canAccess = session.is_admin || session.roles.includes("setter") || session.roles.includes("closer");
  if (!canAccess) redirect("/");

  const sb = createServerClient();

  const [leadsRes, setters, campaigns] = await Promise.all([
    sb
      .from("leads")
      .select("id, nombre, instagram, email, telefono, setter_id, utm_source, utm_medium, utm_content, fecha_agendado, fecha_llamada, estado, sheets_row_index, fuente")
      .range(0, 9999),
    sb.from("team_members").select("id, nombre").eq("is_setter", true).eq("activo", true).order("nombre"),
    sb.from("utm_campaigns").select("medium, setter_id"),
  ]);

  const mediumToSetter = new Map<string, string>();
  for (const c of (campaigns.data || [])) {
    if (c.setter_id && c.medium) mediumToSetter.set(String(c.medium).toLowerCase(), c.setter_id);
  }

  // Filter leads without setter (direct or via utm_medium)
  const sinSetter = (leadsRes.data || []).filter((l) => {
    if (l.setter_id) return false;
    if (l.utm_medium && mediumToSetter.has(l.utm_medium.toLowerCase())) return false;
    return true;
  });

  return (
    <LeadsSinSetterClient
      leads={sinSetter}
      setters={(setters.data || []) as Array<{ id: string; nombre: string }>}
      currentUser={{ id: session.team_member_id, nombre: session.nombre, isAdmin: session.is_admin, isSetter: session.roles.includes("setter") }}
    />
  );
}
