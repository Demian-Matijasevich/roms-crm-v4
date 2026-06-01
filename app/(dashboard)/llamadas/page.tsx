import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchTeamMembers } from "@/lib/queries/leads";
import { fetchPayments } from "@/lib/queries/payments";
import { getUsdRate } from "@/lib/queries/settings";
import { getNichoFilter } from "@/lib/vista";
import LlamadasClient from "./LlamadasClient";

export const dynamic = "force-dynamic";

export default async function LlamadasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const nicho = await getNichoFilter();
  const [leadsAll, team, paymentsAll, usdRate] = await Promise.all([
    fetchLeads(),
    fetchTeamMembers(),
    fetchPayments(),
    getUsdRate(),
  ]);
  const leads = nicho ? leadsAll.filter((l) => (l as { nicho?: string | null }).nicho === nicho) : leadsAll;
  const leadIdSet = nicho ? new Set(leads.map((l) => l.id)) : null;
  const payments = leadIdSet ? paymentsAll.filter((p) => p.lead_id && leadIdSet.has(p.lead_id)) : paymentsAll;

  const closers = team.filter((t) => t.is_closer);
  const setters = team.filter((t) => t.is_setter);

  return (
    <LlamadasClient
      leads={leads}
      closers={closers}
      setters={setters}
      payments={payments}
      usdRate={usdRate}
      session={session}
    />
  );
}
