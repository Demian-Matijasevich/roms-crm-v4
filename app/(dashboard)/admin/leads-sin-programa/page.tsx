import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import LeadsSinProgramaClient from "./LeadsSinProgramaClient";

export const dynamic = "force-dynamic";

export default async function LeadsSinProgramaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  // Leads vendidos (con c1 pagada) que NO tienen programa_pitcheado o tienen un valor raro
  const { data } = await sb
    .from("leads")
    .select("id, nombre, programa_pitcheado, ticket_total, estado, fecha_llamada, closer:team_members!leads_closer_id_fkey(nombre)")
    .or("programa_pitcheado.is.null,programa_pitcheado.eq.")
    .in("estado", ["cerrado", "reserva", "adentro_seguimiento"])
    .order("fecha_llamada", { ascending: false })
    .range(0, 999);

  const leads = (data || []).map((l: Record<string, unknown>) => {
    const closer = l.closer as { nombre?: string } | { nombre?: string }[] | null;
    const closerNombre = Array.isArray(closer) ? closer[0]?.nombre : closer?.nombre;
    return {
      id: l.id as string,
      nombre: (l.nombre as string) || "(s/n)",
      programa_pitcheado: l.programa_pitcheado as string | null,
      ticket_total: Number(l.ticket_total || 0),
      estado: l.estado as string,
      fecha_llamada: l.fecha_llamada as string | null,
      closer_nombre: closerNombre || null,
    };
  });

  return <LeadsSinProgramaClient leads={leads} />;
}
