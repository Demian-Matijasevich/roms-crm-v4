import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import PendientesClient from "./PendientesClient";

export const dynamic = "force-dynamic";

export default async function PendientesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const sb = createServerClient();
  const nicho = await getNichoFilter();

  let q = sb
    .from("leads")
    .select("id, nombre, telefono, instagram, estado, ticket_total, fecha_llamada, fecha_agendado, closer_id, setter_id, reporte_general, contexto_setter, programa_pitcheado, plan_pago, nicho")
    .or(
      "closer_id.is.null,setter_id.is.null,reporte_general.is.null,reporte_general.eq."
    );
  if (nicho) q = q.eq("nicho", nicho);
  if (!session.is_admin) {
    q = q.or(`closer_id.eq.${session.team_member_id},setter_id.eq.${session.team_member_id}`);
  }
  q = q.order("fecha_llamada", { ascending: false, nullsFirst: false }).limit(500);

  const [{ data: leads }, { data: team }] = await Promise.all([
    q,
    sb.from("team_members").select("id, nombre, is_closer, is_setter, activo").eq("activo", true),
  ]);

  const closers = (team || []).filter((t) => t.is_closer).map(({ id, nombre }) => ({ id, nombre }));
  const setters = (team || []).filter((t) => t.is_setter).map(({ id, nombre }) => ({ id, nombre }));

  return (
    <PendientesClient
      leads={leads || []}
      closers={closers}
      setters={setters}
      session={session}
    />
  );
}
