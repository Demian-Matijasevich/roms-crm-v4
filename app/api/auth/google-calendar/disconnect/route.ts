import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const sb = createServerClient();
  const { error } = await sb
    .from("closer_calendar_tokens")
    .delete()
    .eq("team_member_id", auth.session.team_member_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
