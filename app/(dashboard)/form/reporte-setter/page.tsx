import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ReporteSetterForm from "./ReporteSetterForm";

export const dynamic = "force-dynamic";

export default async function ReporteSetterPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSetter = session.roles.includes("setter");
  const isAdmin = session.is_admin;

  if (!isSetter && !isAdmin) redirect("/");

  return <ReporteSetterForm session={session} />;
}
