import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchTeamMembers } from "@/lib/queries/leads";
import { fetchPayments } from "@/lib/queries/payments";
import { getUsdRate } from "@/lib/queries/settings";
import LlamadasClient from "./LlamadasClient";

export const dynamic = "force-dynamic";

export default async function LlamadasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [leads, team, payments, usdRate] = await Promise.all([
    fetchLeads(),
    fetchTeamMembers(),
    fetchPayments(),
    getUsdRate(),
  ]);

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
