import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUtmCampaign } from "@/lib/queries/utm";
import { createServerClient } from "@/lib/supabase-server";
import { z } from "zod";

const utmSchema = z.object({
  url: z.string().url("URL invalida"),
  source: z.string().min(1, "Source requerido"),
  medium: z.string().min(1, "Medium requerido"),
  content: z.string().min(1, "Content requerido"),
  setter_id: z.string().uuid().nullable().default(null),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const parsed = utmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const campaign = await createUtmCampaign(parsed.data);
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    console.error("[POST /api/utm]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = ["url", "source", "medium", "content", "setter_id"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("utm_campaigns")
      .update(patch)
      .eq("id", id)
      .select("*, setter:team_members!setter_id(id, nombre)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, campaign: data });
  } catch (err) {
    console.error("[PATCH /api/utm]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase.from("utm_campaigns").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/utm]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
