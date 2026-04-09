import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchSessions, fetchSessionAvailability } from "@/lib/queries/tracker";
import TrackerClient from "./TrackerClient";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [sessions, availability] = await Promise.all([
    fetchSessions(),
    fetchSessionAvailability(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Tracker 1a1</h1>
      <TrackerClient sessions={sessions} availability={availability} session={session} />
    </div>
  );
}
