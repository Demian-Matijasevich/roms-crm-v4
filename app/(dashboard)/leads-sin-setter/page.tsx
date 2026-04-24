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

  // Detect duplicates in the full leads set by email / instagram / nombre
  const allLeads = leadsRes.data || [];
  const emailCount = new Map<string, number>();
  const igCount = new Map<string, number>();
  const nameCount = new Map<string, number>();
  for (const l of allLeads) {
    if (l.email) emailCount.set(l.email.toLowerCase().trim(), (emailCount.get(l.email.toLowerCase().trim()) || 0) + 1);
    if (l.instagram) igCount.set(l.instagram.toLowerCase().replace(/^@/, "").trim(), (igCount.get(l.instagram.toLowerCase().replace(/^@/, "").trim()) || 0) + 1);
    if (l.nombre) nameCount.set(l.nombre.toLowerCase().trim(), (nameCount.get(l.nombre.toLowerCase().trim()) || 0) + 1);
  }

  // Filter leads without setter + flag duplicates
  const sinSetter = allLeads
    .filter((l) => {
      if (l.setter_id) return false;
      if (l.utm_medium && mediumToSetter.has(l.utm_medium.toLowerCase())) return false;
      return true;
    })
    .map((l) => {
      const dupEmail = l.email && (emailCount.get(l.email.toLowerCase().trim()) || 0) > 1;
      const dupIg = l.instagram && (igCount.get(l.instagram.toLowerCase().replace(/^@/, "").trim()) || 0) > 1;
      const dupName = l.nombre && (nameCount.get(l.nombre.toLowerCase().trim()) || 0) > 1;
      return { ...l, is_duplicado: Boolean(dupEmail || dupIg || dupName), dup_reason: dupEmail ? "email" : dupIg ? "instagram" : dupName ? "nombre" : null };
    });

  return (
    <LeadsSinSetterClient
      leads={sinSetter}
      setters={(setters.data || []) as Array<{ id: string; nombre: string }>}
      currentUser={{ id: session.team_member_id, nombre: session.nombre, isAdmin: session.is_admin, isSetter: session.roles.includes("setter") }}
    />
  );
}
