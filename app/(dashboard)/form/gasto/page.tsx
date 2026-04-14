import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchTeamMembers } from "@/lib/queries/leads";
import CargarGastoForm from "./CargarGastoForm";

export const dynamic = "force-dynamic";

export default async function CargarGastoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const team = await fetchTeamMembers();
  const admins = team.filter((t) => t.is_admin);

  return <CargarGastoForm admins={admins} session={session} />;
}
