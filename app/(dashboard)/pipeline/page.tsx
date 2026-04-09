import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchLeadsByCloser, fetchTeamMembers } from "@/lib/queries/leads";
import { fetchPayments } from "@/lib/queries/payments";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.is_admin;

  const [allLeads, payments, team] = await Promise.all([
    isAdmin ? fetchLeads() : fetchLeadsByCloser(session.team_member_id),
    fetchPayments(),
    fetchTeamMembers(),
  ]);

  const closers = team.filter((t) => t.is_closer);
  const setters = team.filter((t) => t.is_setter);

  // Build a payments lookup by lead_id
  const paymentsByLead: Record<string, typeof payments> = {};
  for (const p of payments) {
    if (p.lead_id) {
      if (!paymentsByLead[p.lead_id]) paymentsByLead[p.lead_id] = [];
      paymentsByLead[p.lead_id].push(p);
    }
  }

  return (
    <PipelineClient
      leads={allLeads}
      paymentsByLead={paymentsByLead}
      closers={closers}
      setters={setters}
      session={session}
      isAdmin={isAdmin}
    />
  );
}
