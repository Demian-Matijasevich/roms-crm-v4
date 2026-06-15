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

  // UPDATE condicional: solo si sigue siendo NULL (o forzado por admin).
  // Esto evita la race condition de 2 closers tapeando el huerfano a la vez —
  // el segundo recibe rowcount 0 y devolvemos 409.
  let updateQuery = sb.from("leads").update({ closer_id: session.team_member_id }).eq("id", id);
  if (!force) updateQuery = updateQuery.is("closer_id", null);
  const { data: updated, error } = await updateQuery.select("id, closer_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    // No matchó la condición — otro closer la tomó antes.
    const { data: nowLead } = await sb.from("leads").select("closer_id").eq("id", id).maybeSingle();
    return NextResponse.json(
      { error: "lead ya tomado por otro closer", closer_id: nowLead?.closer_id || null },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, closer_id: session.team_member_id });
}
