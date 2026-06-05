/**
 * GET    /api/leads/[id]/attachments     — lista adjuntos del lead.
 * POST   /api/leads/[id]/attachments     — agrega un adjunto por URL externa.
 * DELETE /api/leads/[id]/attachments?id= — elimina un adjunto.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TIPOS_VALIDOS = new Set(["pdf", "image", "doc", "link", "other"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_attachments")
    .select("id, lead_id, nombre, url, tipo, size_bytes, uploaded_by, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attachments: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre || "").trim();
  const url = String(body.url || "").trim();
  const tipoRaw = String(body.tipo || "link");
  const tipo = TIPOS_VALIDOS.has(tipoRaw) ? tipoRaw : "other";
  const sizeBytes = typeof body.size_bytes === "number" ? body.size_bytes : null;

  if (!nombre) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url requerida" }, { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_attachments")
    .insert({
      lead_id: id,
      nombre,
      url,
      tipo,
      size_bytes: sizeBytes,
      uploaded_by: session.team_member_id || null,
    })
    .select("id, lead_id, nombre, url, tipo, size_bytes, uploaded_by, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("lead_activity").insert({
    lead_id: id,
    actor_id: session.team_member_id || null,
    actor_nombre: session.nombre,
    tipo: "attachment_add",
    mensaje: `adjuntó "${nombre.slice(0, 80)}"`,
    meta: { attachment_id: data.id, url },
  });

  return NextResponse.json({ attachment: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const attId = req.nextUrl.searchParams.get("id");
  if (!attId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const sb = createServerClient();
  const { error } = await sb
    .from("lead_attachments")
    .delete()
    .eq("id", attId)
    .eq("lead_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
