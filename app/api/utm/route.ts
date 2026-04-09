import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUtmCampaign } from "@/lib/queries/utm";
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
