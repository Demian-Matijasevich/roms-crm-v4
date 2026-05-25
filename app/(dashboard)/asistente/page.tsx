import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AsistenteClient from "./AsistenteClient";

export const dynamic = "force-dynamic";

export default async function AsistentePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");
  return <AsistenteClient session={session} />;
}
