import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import LeadsClient from "./LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();

  const [leadsRes, teamRes] = await Promise.all([
    sb
      .from("leads")
      .select("id, nombre, instagram, email, telefono, setter_id, closer_id, estado, utm_source, utm_medium, utm_content, fecha_agendado, fecha_llamada, sheets_row_index, fuente, programa_pitcheado, ticket_total, lead_calificado")
      .order("fecha_agendado", { ascending: false, nullsFirst: false })
      .range(0, 9999),
    sb.from("team_members").select("id, nombre, is_setter, is_closer").eq("activo", true).order("nombre"),
  ]);

  const team = (teamRes.data || []) as Array<{ id: string; nombre: string; is_setter: boolean; is_closer: boolean }>;

  // Detect duplicates by email, instagram, or nombre (normalizado)
  const allLeads = (leadsRes.data || []) as LeadRow[];
  const normEmail = (s: string | null) => (s || "").toLowerCase().trim();
  const normIg = (s: string | null) => (s || "").toLowerCase().replace(/^@/, "").trim();
  const normName = (s: string | null) => (s || "").toLowerCase().trim();

  const emailCount = new Map<string, number>();
  const igCount = new Map<string, number>();
  const nameCount = new Map<string, number>();
  for (const l of allLeads) {
    const e = normEmail(l.email); if (e) emailCount.set(e, (emailCount.get(e) || 0) + 1);
    const i = normIg(l.instagram); if (i) igCount.set(i, (igCount.get(i) || 0) + 1);
    const n = normName(l.nombre); if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
  }

  const leadsWithDup: LeadRow[] = allLeads.map((l) => {
    const e = normEmail(l.email);
    const i = normIg(l.instagram);
    const n = normName(l.nombre);
    const dupEmail = e && (emailCount.get(e) || 0) > 1;
    const dupIg = i && (igCount.get(i) || 0) > 1;
    const dupName = n && (nameCount.get(n) || 0) > 1;
    return {
      ...l,
      is_duplicado: Boolean(dupEmail || dupIg || dupName),
      dup_reason: dupEmail ? "email" : dupIg ? "instagram" : dupName ? "nombre" : null,
      dup_key: dupEmail ? `email:${e}` : dupIg ? `ig:${i}` : dupName ? `name:${n}` : null,
    };
  });

  return (
    <LeadsClient
      leads={leadsWithDup}
      setters={team.filter((t) => t.is_setter).map(({ id, nombre }) => ({ id, nombre }))}
      closers={team.filter((t) => t.is_closer).map(({ id, nombre }) => ({ id, nombre }))}
    />
  );
}

export interface LeadRow {
  id: string;
  nombre: string;
  instagram: string | null;
  email: string | null;
  telefono: string | null;
  setter_id: string | null;
  closer_id: string | null;
  estado: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  sheets_row_index: number | null;
  fuente: string | null;
  programa_pitcheado: string | null;
  ticket_total: number | null;
  lead_calificado: string | null;
  is_duplicado?: boolean;
  dup_reason?: string | null;
  dup_key?: string | null;
}
