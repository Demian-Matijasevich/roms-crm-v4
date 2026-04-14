import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchTeamMembers } from "@/lib/queries/leads";
import { getUsdRate } from "@/lib/queries/settings";
import CargarGastoForm from "./CargarGastoForm";

export const dynamic = "force-dynamic";

export default async function CargarGastoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const [team, usdRate] = await Promise.all([fetchTeamMembers(), getUsdRate()]);
  const admins = team.filter((t) => t.is_admin);

  return <CargarGastoForm admins={admins} usdRate={usdRate} session={session} />;
}
