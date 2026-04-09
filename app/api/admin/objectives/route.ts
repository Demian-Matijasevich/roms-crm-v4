import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { z } from "zod";

const upsertSchema = z.object({
  team_member_id: z.string().uuid(),
  mes_fiscal: z.string().min(1),
  objetivo_cash: z.number().min(0).default(0),
  objetivo_cierres: z.number().int().min(0).default(0),
  objetivo_agendas: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("objectives")
      .upsert(parsed.data, {
        onConflict: "team_member_id,mes_fiscal",
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/admin/objectives]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/admin/objectives]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("objectives")
      .select("*, team_member:team_members(id,nombre)")
      .order("mes_fiscal", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/admin/objectives]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
