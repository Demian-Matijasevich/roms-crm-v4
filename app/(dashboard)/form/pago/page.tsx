import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchTeamMembers } from "@/lib/queries/leads";
import { fetchPayments } from "@/lib/queries/payments";
import CargarPagoForm from "./CargarPagoForm";

export const dynamic = "force-dynamic";

export default async function CargarPagoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [leads, payments, team] = await Promise.all([
    fetchLeads(),
    fetchPayments(),
    fetchTeamMembers(),
  ]);

  // Only show leads that have been cerrado (have a deal)
  const cerrados = leads.filter(
    (l) => l.estado === "cerrado" || l.estado === "reserva"
  );

  // Build payments lookup by lead_id
  const paymentsByLead: Record<string, typeof payments> = {};
  for (const p of payments) {
    if (p.lead_id) {
      if (!paymentsByLead[p.lead_id]) paymentsByLead[p.lead_id] = [];
      paymentsByLead[p.lead_id].push(p);
    }
  }

  return (
    <CargarPagoForm
      leads={cerrados}
      paymentsByLead={paymentsByLead}
      team={team}
      session={session}
    />
  );
}
