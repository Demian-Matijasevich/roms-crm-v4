/**
 * GET  /api/cerrar-dia/comentario?date=YYYY-MM-DD&team_member_id=UUID
 *   - Si no se pasa team_member_id: usa session.team_member_id
 *   - Si es admin y pasa team_member_id: trae el de ese miembro
 *   - Si es admin sin filtro y querys "&all=1": trae todos los del día
 *
 * POST /api/cerrar-dia/comentario
 *   Body: { fecha: "YYYY-MM-DD", comentario: string, team_member_id?: string }
 *   Upsert por (team_member_id, fecha). Solo admin puede pasar team_member_id distinto al suyo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getToday, toDateString } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const fecha = url.searchParams.get("date") || toDateString(getToday());
  const memberId = url.searchParams.get("team_member_id");
  const all = url.searchParams.get("all") === "1";

  const sb = createServerClient();

  if (auth.session.is_admin && all) {
    const { data } = await sb
      .from("closer_daily_notes")
      .select("id, team_member_id, fecha, comentario, updated_at, team:team_members!team_member_id(nombre)")
      .eq("fecha", fecha)
      .order("updated_at", { ascending: false });
    return NextResponse.json({ notes: data || [] });
  }

  const targetMemberId = (auth.session.is_admin && memberId) ? memberId : auth.session.team_member_id;
  if (!targetMemberId) return NextResponse.json({ note: null });

  const { data } = await sb
    .from("closer_daily_notes")
    .select("id, comentario, updated_at")
    .eq("team_member_id", targetMemberId)
    .eq("fecha", fecha)
    .maybeSingle();

  return NextResponse.json({ note: data || null });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const fecha = String(body.fecha || "").slice(0, 10);
  const comentario = String(body.comentario || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 });
  }

  const targetMemberId = (auth.session.is_admin && body.team_member_id)
    ? String(body.team_member_id)
    : auth.session.team_member_id;
  if (!targetMemberId) return NextResponse.json({ error: "sin team_member" }, { status: 400 });

  const sb = createServerClient();
  const { error } = await sb
    .from("closer_daily_notes")
    .upsert(
      { team_member_id: targetMemberId, fecha, comentario, updated_at: new Date().toISOString() },
      { onConflict: "team_member_id,fecha" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
