import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import RefundsImportClient from "./RefundsImportClient";

export const dynamic = "force-dynamic";

export default async function RefundsImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");
  return <RefundsImportClient />;
}
