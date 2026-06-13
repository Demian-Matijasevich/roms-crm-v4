/**
 * POST /api/leads/[id]/tomar
 * "Tomar" un lead — asigna closer_id al team_member del usuario actual.
 * Solo permite si el lead NO tiene closer_id (evita pisarse).
 * Admin puede forzar con { force: true }.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  // Solo closers (o admin) pueden "tomar" un lead. Setters/cobranzas no.
  if (!session.is_admin && !session.roles?.includes("closer")) {
    return NextResponse.json({ error: "Solo closers pueden tomar leads" }, { status: 403 });
  }

  if (!session.team_member_id) {
    return NextResponse.json({ error: "tu usuario no está asociado a un team_member" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const force = !!body.force;

  const sb = createServerClient();
  const { data: lead } = await sb.from("leads").select("id, nombre, closer_id, nicho").eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead no encontrado" }, { status: 404 });

  if (lead.closer_id && lead.closer_id !== session.team_member_id && !force) {
    return NextResponse.json({ error: "lead ya tomado por otro closer", closer_id: lead.closer_id }, { status: 409 });
  }
  if (lead.closer_id === session.team_member_id) {
    return NextResponse.json({ ok: true, already: true });
  }
  if (lead.closer_id && force && !session.is_admin) {
    return NextResponse.json({ error: "solo admin puede forzar reasignación" }, { status: 403 });
  }

  const { error } = await sb.from("leads").update({ closer_id: session.team_member_id }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, closer_id: session.team_member_id });
}
