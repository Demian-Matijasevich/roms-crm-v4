import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchLeadsByCloser, fetchTeamMembers } from "@/lib/queries/leads";
import { getUsdRate } from "@/lib/queries/settings";
import { getVista } from "@/lib/vista";
import CargarLlamadaForm from "./CargarLlamadaForm";

export const dynamic = "force-dynamic";

export default async function CargarLlamadaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.is_admin;
  const isCloser = session.roles.includes("closer");

  if (!isAdmin && !isCloser) redirect("/");

  const vista = await getVista();
  const defaultNicho = vista === "politica" ? "politica" : "general";

  const [leads, team, usdRate] = await Promise.all([
    isAdmin ? fetchLeads() : fetchLeadsByCloser(session.team_member_id),
    fetchTeamMembers(),
    getUsdRate(),
  ]);

  // Only show pendientes (leads without a result)
  const pendientes = leads.filter(
    (l) => l.estado === "pendiente" || l.estado === "reprogramada"
  );

  return <CargarLlamadaForm leads={pendientes} team={team} usdRate={usdRate} session={session} defaultNicho={defaultNicho} />;
}
