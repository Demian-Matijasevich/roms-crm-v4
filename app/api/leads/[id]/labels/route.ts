/**
 * GET    /api/leads/[id]/labels             — labels asignados a este lead.
 * POST   /api/leads/[id]/labels             — agrega un link {label_id}.
 * DELETE /api/leads/[id]/labels?label_id=…  — quita un link.
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
    .from("lead_label_links")
    .select("label_id, label:lead_labels!inner(id, nombre, color, scope)")
    .eq("lead_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Mapeamos a una lista plana de labels
  type Row = { label_id: string; label: { id: string; nombre: string; color: string; scope: string } };
  const labels = ((data || []) as unknown as Row[]).map((r) => r.label).filter(Boolean);
  return NextResponse.json({ labels });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const labelId = String(body.label_id || "");
  if (!labelId) return NextResponse.json({ error: "label_id requerido" }, { status: 400 });

  const sb = createServerClient();
  const { error } = await sb.from("lead_label_links").insert({ lead_id: id, label_id: labelId });
  // PK compuesta: si ya existe ignoramos el error de duplicate (23505)
  if (error && !/duplicate/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Obtenemos el nombre del label para el log
  const { data: label } = await sb.from("lead_labels").select("nombre").eq("id", labelId).maybeSingle();
  await sb.from("lead_activity").insert({
    lead_id: id,
    actor_id: session.team_member_id || null,
    actor_nombre: session.nombre,
    tipo: "label_add",
    mensaje: `agregó label "${label?.nombre || ""}"`,
    meta: { label_id: labelId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const labelId = req.nextUrl.searchParams.get("label_id");
  if (!labelId) return NextResponse.json({ error: "label_id requerido" }, { status: 400 });

  const sb = createServerClient();
  // Obtenemos el nombre antes de borrar (para el log)
  const { data: label } = await sb.from("lead_labels").select("nombre").eq("id", labelId).maybeSingle();

  const { error } = await sb
    .from("lead_label_links")
    .delete()
    .eq("lead_id", id)
    .eq("label_id", labelId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("lead_activity").insert({
    lead_id: id,
    actor_id: session.team_member_id || null,
    actor_nombre: session.nombre,
    tipo: "label_remove",
    mensaje: `quitó label "${label?.nombre || ""}"`,
    meta: { label_id: labelId },
  });

  return NextResponse.json({ ok: true });
}
