/**
 * GET   /api/leads/[id]/checklist  — lista items del checklist ordenado por position.
 * POST  /api/leads/[id]/checklist  — agrega un item al final (position = max+1).
 * PATCH /api/leads/[id]/checklist  — update parcial { id, done?, label?, position? }.
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
    .from("lead_checklist")
    .select("id, lead_id, label, done, position, created_at, completed_at")
    .eq("lead_id", id)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const label = String(body.label || "").trim();
  if (!label) return NextResponse.json({ error: "label requerido" }, { status: 400 });

  const sb = createServerClient();

  // Calcular siguiente position
  const { data: last } = await sb
    .from("lead_checklist")
    .select("position")
    .eq("lead_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (last?.position ?? -1) + 1;

  const { data, error } = await sb
    .from("lead_checklist")
    .insert({ lead_id: id, label, done: false, position: nextPos })
    .select("id, lead_id, label, done, position, created_at, completed_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("lead_activity").insert({
    lead_id: id,
    actor_id: session.team_member_id || null,
    actor_nombre: session.nombre,
    tipo: "checklist_item_add",
    mensaje: `agregó "${label.slice(0, 80)}"`,
    meta: { item_id: data.id },
  });

  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const itemId = String(body.id || "");
  if (!itemId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    updates.done = body.done;
    updates.completed_at = body.done ? new Date().toISOString() : null;
  }
  if (typeof body.label === "string") updates.label = body.label;
  if (typeof body.position === "number") updates.position = body.position;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "sin cambios" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_checklist")
    .update(updates)
    .eq("id", itemId)
    .eq("lead_id", id)
    .select("id, lead_id, label, done, position, created_at, completed_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log si se marca done (best-effort)
  if (typeof body.done === "boolean" && body.done) {
    await sb.from("lead_activity").insert({
      lead_id: id,
      actor_id: session.team_member_id || null,
      actor_nombre: session.nombre,
      tipo: "checklist_item_done",
      mensaje: `completó "${(data?.label || "").slice(0, 80)}"`,
      meta: { item_id: itemId },
    });
  }

  return NextResponse.json({ item: data });
}
