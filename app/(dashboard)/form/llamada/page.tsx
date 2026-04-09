import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchLeadsByCloser, fetchTeamMembers } from "@/lib/queries/leads";
import CargarLlamadaForm from "./CargarLlamadaForm";

export const dynamic = "force-dynamic";

export default async function CargarLlamadaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.is_admin;
  const isCloser = session.roles.includes("closer");

  if (!isAdmin && !isCloser) redirect("/");

  const [leads, team] = await Promise.all([
    isAdmin ? fetchLeads() : fetchLeadsByCloser(session.team_member_id),
    fetchTeamMembers(),
  ]);

  // Only show pendientes (leads without a result)
  const pendientes = leads.filter(
    (l) => l.estado === "pendiente" || l.estado === "reprogramada"
  );

  return <CargarLlamadaForm leads={pendientes} team={team} session={session} />;
}
