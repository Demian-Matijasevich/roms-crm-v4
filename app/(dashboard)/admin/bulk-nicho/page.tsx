import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import BulkNichoClient from "./BulkNichoClient";

export const dynamic = "force-dynamic";

export default async function BulkNichoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  return <BulkNichoClient />;
}
