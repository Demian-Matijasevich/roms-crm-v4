/**
 * GET  /api/leads/[id]/comments  — lista los comentarios del lead (asc por fecha).
 * POST /api/leads/[id]/comments  — agrega un comentario y registra actividad.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_comments")
    .select("id, lead_id, author_id, author_nombre, body, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.body || "").trim();
  if (!text) return NextResponse.json({ error: "body requerido" }, { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_comments")
    .insert({
      lead_id: id,
      author_id: session.team_member_id || null,
      author_nombre: session.nombre,
      body: text,
    })
    .select("id, lead_id, author_id, author_nombre, body, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Registrar actividad (best-effort)
  await sb.from("lead_activity").insert({
    lead_id: id,
    actor_id: session.team_member_id || null,
    actor_nombre: session.nombre,
    tipo: "comment",
    mensaje: text.slice(0, 160),
  });

  return NextResponse.json({ comment: data });
}
