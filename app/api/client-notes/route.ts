import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const { client_id, content } = await req.json();

    if (!client_id || !content?.trim()) {
      return NextResponse.json(
        { error: "client_id y content son requeridos" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("client_notes")
      .insert({
        client_id,
        author_id: result.session.team_member_id,
        content: content.trim(),
      })
      .select("*, author:team_members(nombre)")
      .single();

    if (error) {
      console.error("[POST /api/client-notes]", error);
      return NextResponse.json({ error: "Error al crear nota" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note: data });
  } catch (err) {
    console.error("[POST /api/client-notes]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const clientId = req.nextUrl.searchParams.get("client_id");
    if (!clientId) {
      return NextResponse.json({ error: "client_id requerido" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("client_notes")
      .select("*, author:team_members(nombre)")
      .eq("client_id", clientId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/client-notes]", error);
      return NextResponse.json({ error: "Error al obtener notas" }, { status: 500 });
    }

    return NextResponse.json({ notes: data ?? [] });
  } catch (err) {
    console.error("[GET /api/client-notes]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
