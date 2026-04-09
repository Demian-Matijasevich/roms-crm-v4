import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchTeamMembers } from "@/lib/queries/leads";
import VentaChatForm from "./VentaChatForm";

export const dynamic = "force-dynamic";

export default async function VentaChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const team = await fetchTeamMembers();
  const setters = team.filter((t) => t.is_setter);

  return <VentaChatForm session={session} setters={setters} />;
}
