/**
 * Cerrar el día — vista del closer para marcar rápido los estados de las
 * llamadas que tuvo hoy. Sin fricción: kanban de 4 columnas + drag&drop.
 *
 * Reglas:
 *  - Si is_admin: mostrar TODOS los leads del día (puede filtrar por closer)
 *  - Si is_closer: solo los suyos
 *  - Si is_setter o cobranzas: redirige a /
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import { getToday, toDateString } from "@/lib/date-utils";
import CerrarDiaClient from "./CerrarDiaClient";

export const dynamic = "force-dynamic";

export default async function CerrarDiaPage({ searchParams }: { searchParams: Promise<{ d?: string; closer?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin && !session.roles.includes("closer")) redirect("/");

  const sp = await searchParams;
  const today = toDateString(getToday());
  const targetDate = sp.d || today;

  const sb = createServerClient();
  const nicho = await getNichoFilter();

  // Leads del día — rango con TZ Argentina (UTC-3) para que calls entre
  // 21:00 y 23:59 ART no caigan en el día siguiente UTC.
  const dayStart = `${targetDate}T00:00:00-03:00`;
  const dayEndExclusive = (() => {
    const d = new Date(targetDate + "T12:00:00-03:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) + "T00:00:00-03:00";
  })();
  let leadsQuery = sb
    .from("leads")
    .select(
      "id, nombre, fecha_agendado, fecha_llamada, estado, closer_id, setter_id, programa_pitcheado, ticket_total, plan_pago, se_presento, lead_score, notas_internas, contexto_setter, reporte_general, telefono, nicho, closer:team_members!leads_closer_id_fkey(id, nombre), setter:team_members!leads_setter_id_fkey(id, nombre)"
    )
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`)
    .range(0, 999);
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);
  // Si es closer (no admin) solo los suyos
  if (!session.is_admin && session.team_member_id) {
    leadsQuery = leadsQuery.eq("closer_id", session.team_member_id);
  } else if (session.is_admin && sp.closer) {
    leadsQuery = leadsQuery.eq("closer_id", sp.closer);
  }

  // Para el comentario del día: traer del closer logueado o de quien filtre admin
  const noteTargetMemberId = (session.is_admin && sp.closer) ? sp.closer : session.team_member_id;

  const [leadsRes, teamRes, noteRes] = await Promise.all([
    leadsQuery,
    sb
      .from("team_members")
      .select("id, nombre, is_closer")
      .eq("activo", true)
      .eq("is_closer", true)
      .order("nombre"),
    noteTargetMemberId
      ? sb
          .from("closer_daily_notes")
          .select("comentario, updated_at")
          .eq("team_member_id", noteTargetMemberId)
          .eq("fecha", targetDate)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Aplanar closer/setter (PostgREST devuelve arrays para joins single-row)
  type RawLead = { closer?: { id: string; nombre: string }[] | { id: string; nombre: string } | null; setter?: { id: string; nombre: string }[] | { id: string; nombre: string } | null; [k: string]: unknown };
  const leadsFlat = (leadsRes.data ?? []).map((l: unknown) => {
    const r = l as RawLead;
    return {
      ...r,
      closer: Array.isArray(r.closer) ? r.closer[0] || null : r.closer || null,
      setter: Array.isArray(r.setter) ? r.setter[0] || null : r.setter || null,
    };
  });

  return (
    <CerrarDiaClient
      leads={leadsFlat as never[]}
      closers={teamRes.data ?? []}
      currentDate={targetDate}
      todayStr={today}
      isAdmin={session.is_admin}
      currentMemberId={session.team_member_id || null}
      currentNombre={session.nombre}
      filterCloser={sp.closer || ""}
      initialComentario={(noteRes.data as { comentario?: string } | null)?.comentario || ""}
      comentarioTargetMemberId={noteTargetMemberId || null}
    />
  );
}
