import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchTeamMembers } from "@/lib/queries/leads";
import { getUsdRate } from "@/lib/queries/settings";
import CargarDiaForm from "./CargarDiaForm";

export const dynamic = "force-dynamic";

export default async function CargarDiaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Accessible to admin, cobranzas, or seguimiento roles
  const canAccess =
    session.is_admin ||
    session.roles.includes("cobranzas") ||
    session.roles.includes("seguimiento");
  if (!canAccess) redirect("/");

  const [team, usdRate] = await Promise.all([fetchTeamMembers(), getUsdRate()]);
  const closers = team.filter((t) => t.is_closer);

  return <CargarDiaForm closers={closers} usdRate={usdRate} session={session} />;
}
