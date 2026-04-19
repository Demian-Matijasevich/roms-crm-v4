import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ReporteDiarioClient from "./ReporteDiarioClient";

export const dynamic = "force-dynamic";

export default async function ReporteDiarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");
  return <ReporteDiarioClient />;
}
