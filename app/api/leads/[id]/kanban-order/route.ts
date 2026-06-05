/**
 * POST /api/leads/[id]/kanban-order — actualiza el orden manual del lead dentro de su columna.
 * Body: { kanban_order: number }
 * El cliente envía un valor entre los vecinos, ej. (prev + next) / 2.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const value = Number(body.kanban_order);
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: "kanban_order requerido numérico" }, { status: 400 });
  }

  const sb = createServerClient();
  const { error } = await sb.from("leads").update({ kanban_order: value }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, kanban_order: value });
}
