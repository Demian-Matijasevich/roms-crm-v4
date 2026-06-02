import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?unread_only=1 — lista las notifs del session.team_member_id
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const unreadOnly = req.nextUrl.searchParams.get("unread_only") === "1";
  const sb = createServerClient();
  let q = sb
    .from("notifications")
    .select("*")
    .eq("recipient_id", auth.session.team_member_id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) q = q.eq("leida", false);
  const { data } = await q;
  return NextResponse.json({ ok: true, notifications: data || [] });
}

/**
 * PATCH /api/notifications — marca como leídas
 * Body: { ids?: string[], all?: true }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const sb = createServerClient();
  if (body?.all) {
    await sb.from("notifications").update({ leida: true }).eq("recipient_id", auth.session.team_member_id).eq("leida", false);
    return NextResponse.json({ ok: true });
  }
  if (Array.isArray(body?.ids) && body.ids.length > 0) {
    await sb.from("notifications").update({ leida: true }).in("id", body.ids).eq("recipient_id", auth.session.team_member_id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "ids o all requerido" }, { status: 400 });
}
