import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import ConectarCalendarClient from "./ConectarCalendarClient";

export const dynamic = "force-dynamic";

export default async function ConectarCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const sb = createServerClient();
  const { data: token } = await sb
    .from("closer_calendar_tokens")
    .select("google_email, connected_at, updated_at, last_sync_at, last_sync_ok")
    .eq("team_member_id", session.team_member_id)
    .maybeSingle();

  return (
    <ConectarCalendarClient
      nombre={session.nombre}
      token={token || null}
      flashOk={sp.connected || null}
      flashError={sp.error || null}
    />
  );
}
