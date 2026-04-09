import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { onboardingSchema } from "@/lib/schemas";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const body = await req.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Create onboarding record
    const { data: onboarding, error: obErr } = await supabase
      .from("onboarding")
      .insert(parsed.data)
      .select()
      .single();

    if (obErr) {
      console.error("[POST /api/onboarding] insert", obErr);
      return NextResponse.json({ error: "Error creando onboarding" }, { status: 500 });
    }

    // Update client: set fecha_onboarding, discord, skool access flags
    const updateFields: Record<string, unknown> = {
      fecha_onboarding: parsed.data.fecha_ingreso,
    };
    if (parsed.data.discord_user) updateFields.discord = true;
    if (parsed.data.skool_user) updateFields.skool = true;
    if (parsed.data.email) updateFields.email = parsed.data.email;
    if (parsed.data.telefono) updateFields.telefono = parsed.data.telefono;

    const { error: updateErr } = await supabase
      .from("clients")
      .update(updateFields)
      .eq("id", parsed.data.client_id);

    if (updateErr) {
      console.error("[POST /api/onboarding] update client", updateErr);
      // Non-fatal: onboarding was created, client update failed
    }

    return NextResponse.json({ ok: true, onboarding });
  } catch (err) {
    console.error("[POST /api/onboarding]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
