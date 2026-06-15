/**
 * EOD Wizard — flujo sin fricción para cerrar el día.
 *
 * Le presenta al closer las llamadas del día una por una con preguntas
 * grandes y tap-only (¿vino? → ¿resultado? → ticket si cerró).
 *
 * - Mobile-first. Si abre el link desde WhatsApp queda full-screen.
 * - Si es admin, ve TODAS las llamadas del día (puede filtrar por closer).
 * - Solo muestra leads con estado=pendiente (sin marcar). Si no hay,
 *   muestra check verde "✓ Día cerrado".
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import { getToday, toDateString } from "@/lib/date-utils";
import EodWizardClient from "./EodWizardClient";

export const dynamic = "force-dynamic";

export default async function EodPage({ searchParams }: { searchParams: Promise<{ d?: string; closer?: string; mode?: string; vista?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin && !session.roles.includes("closer")) redirect("/");

  const sp = await searchParams;
  const today = toDateString(getToday());
  const targetDate = sp.d || today;
  const vistaSemana = session.is_admin && sp.vista === "semana";

  const sb = createServerClient();
  const nicho = await getNichoFilter();

  // Si vista semana → bajamos los últimos 7 días con leads por closer (matrix).
  if (vistaSemana) {
    const weekStartDate = (() => {
      const d = new Date(targetDate + "T12:00:00-03:00");
      d.setDate(d.getDate() - 6);
      return d.toISOString().slice(0, 10);
    })();
    const weekStart = `${weekStartDate}T00:00:00-03:00`;
    const weekEnd = (() => {
      const d = new Date(targetDate + "T12:00:00-03:00");
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10) + "T00:00:00-03:00";
    })();

    let weekLeadsQuery = sb
      .from("leads")
      .select("id, fecha_agendado, fecha_llamada, estado, closer_id")
      .or(`and(fecha_llamada.gte.${weekStart},fecha_llamada.lt.${weekEnd}),and(fecha_agendado.gte.${weekStart},fecha_agendado.lt.${weekEnd})`)
      .range(0, 9999);
    if (nicho) weekLeadsQuery = weekLeadsQuery.eq("nicho", nicho);
    if (sp.closer) weekLeadsQuery = weekLeadsQuery.eq("closer_id", sp.closer);

    const [weekRes, closersListRes] = await Promise.all([
      weekLeadsQuery,
      sb.from("team_members").select("id, nombre").eq("activo", true).eq("is_closer", true).order("nombre"),
    ]);

    return (
      <EodWizardClient
        leads={[] as never[]}
        huerfanos={[] as never[]}
        totalDelDia={0}
        currentDate={targetDate}
        todayStr={today}
        isAdmin={session.is_admin}
        currentMemberId={session.team_member_id || null}
        currentNombre={session.nombre}
        filterCloser={sp.closer || ""}
        mode="pendientes"
        vista="semana"
        weekLeads={(weekRes.data || []) as never[]}
        weekStartDate={weekStartDate}
        weekEndDate={targetDate}
        closersList={(closersListRes.data || []) as never[]}
        initialComentario=""
        comentarioTargetMemberId={null}
      />
    );
  }

  const dayStart = `${targetDate}T00:00:00-03:00`;
  const dayEndExclusive = (() => {
    const d = new Date(targetDate + "T12:00:00-03:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) + "T00:00:00-03:00";
  })();

  // mode=todas (solo admin): incluye también leads ya marcados para edición.
  // Para closers o modo default: solo pendientes (los que no marcaron aún).
  const showAll = session.is_admin && sp.mode === "todas";

  let leadsQuery = sb
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, se_presento, closer_id, programa_pitcheado, ticket_total, telefono, instagram, nicho")
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`)
    .order("fecha_agendado", { ascending: true })
    .range(0, 999);

  if (!showAll) leadsQuery = leadsQuery.eq("estado", "pendiente");
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  if (!session.is_admin && session.team_member_id) {
    leadsQuery = leadsQuery.eq("closer_id", session.team_member_id);
  } else if (session.is_admin && sp.closer) {
    leadsQuery = leadsQuery.eq("closer_id", sp.closer);
  }

  // Huérfanos del día (closer_id NULL) — visibles para que el closer "agarre"
  // las suyas si iClosed no las asignó.
  let huerfanosQuery = sb
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, closer_id, programa_pitcheado, ticket_total, telefono, instagram, nicho")
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`)
    .is("closer_id", null)
    .eq("estado", "pendiente")
    .order("fecha_agendado", { ascending: true })
    .range(0, 99);
  if (nicho) huerfanosQuery = huerfanosQuery.eq("nicho", nicho);

  // Total del día (para mostrar "3 de 8 marcadas")
  let totalQuery = sb
    .from("leads")
    .select("id, estado", { count: "exact", head: true })
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`);
  if (nicho) totalQuery = totalQuery.eq("nicho", nicho);
  if (!session.is_admin && session.team_member_id) totalQuery = totalQuery.eq("closer_id", session.team_member_id);
  else if (session.is_admin && sp.closer) totalQuery = totalQuery.eq("closer_id", sp.closer);

  const noteTargetMemberId = (session.is_admin && sp.closer) ? sp.closer : session.team_member_id;

  // Lista de closers para el selector admin
  const closersListQuery = session.is_admin
    ? sb.from("team_members").select("id, nombre").eq("activo", true).eq("is_closer", true).order("nombre")
    : Promise.resolve({ data: [] });

  const [leadsRes, totalRes, huerfanosRes, noteRes, closersListRes] = await Promise.all([
    leadsQuery,
    totalQuery,
    huerfanosQuery,
    noteTargetMemberId
      ? sb
          .from("closer_daily_notes")
          .select("comentario")
          .eq("team_member_id", noteTargetMemberId)
          .eq("fecha", targetDate)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    closersListQuery,
  ]);

  return (
    <EodWizardClient
      leads={(leadsRes.data || []) as never[]}
      huerfanos={(huerfanosRes.data || []) as never[]}
      totalDelDia={totalRes.count || 0}
      currentDate={targetDate}
      todayStr={today}
      isAdmin={session.is_admin}
      currentMemberId={session.team_member_id || null}
      currentNombre={session.nombre}
      filterCloser={sp.closer || ""}
      mode={sp.mode === "todas" ? "todas" : "pendientes"}
      vista="dia"
      weekLeads={[] as never[]}
      weekStartDate=""
      weekEndDate=""
      closersList={(closersListRes.data || []) as never[]}
      initialComentario={(noteRes.data as { comentario?: string } | null)?.comentario || ""}
      comentarioTargetMemberId={noteTargetMemberId || null}
    />
  );
}
