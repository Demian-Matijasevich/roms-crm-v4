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

export default async function EodPage({ searchParams }: { searchParams: Promise<{ d?: string; closer?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin && !session.roles.includes("closer")) redirect("/");

  const sp = await searchParams;
  const today = toDateString(getToday());
  const targetDate = sp.d || today;

  const sb = createServerClient();
  const nicho = await getNichoFilter();

  const dayStart = `${targetDate}T00:00:00`;
  const dayEndExclusive = (() => {
    const d = new Date(targetDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) + "T00:00:00";
  })();

  // Solo leads PENDIENTES del día (los que el closer todavía no marcó)
  let leadsQuery = sb
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, closer_id, programa_pitcheado, ticket_total, telefono, instagram, nicho")
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`)
    .eq("estado", "pendiente")
    .order("fecha_agendado", { ascending: true })
    .range(0, 999);

  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  if (!session.is_admin && session.team_member_id) {
    leadsQuery = leadsQuery.eq("closer_id", session.team_member_id);
  } else if (session.is_admin && sp.closer) {
    leadsQuery = leadsQuery.eq("closer_id", sp.closer);
  }

  // Total del día (para mostrar "3 de 8 marcadas")
  let totalQuery = sb
    .from("leads")
    .select("id, estado", { count: "exact", head: true })
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`);
  if (nicho) totalQuery = totalQuery.eq("nicho", nicho);
  if (!session.is_admin && session.team_member_id) totalQuery = totalQuery.eq("closer_id", session.team_member_id);
  else if (session.is_admin && sp.closer) totalQuery = totalQuery.eq("closer_id", sp.closer);

  const noteTargetMemberId = (session.is_admin && sp.closer) ? sp.closer : session.team_member_id;

  const [leadsRes, totalRes, noteRes] = await Promise.all([
    leadsQuery,
    totalQuery,
    noteTargetMemberId
      ? sb
          .from("closer_daily_notes")
          .select("comentario")
          .eq("team_member_id", noteTargetMemberId)
          .eq("fecha", targetDate)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <EodWizardClient
      leads={(leadsRes.data || []) as never[]}
      totalDelDia={totalRes.count || 0}
      currentDate={targetDate}
      todayStr={today}
      isAdmin={session.is_admin}
      currentNombre={session.nombre}
      filterCloser={sp.closer || ""}
      initialComentario={(noteRes.data as { comentario?: string } | null)?.comentario || ""}
      comentarioTargetMemberId={noteTargetMemberId || null}
    />
  );
}
