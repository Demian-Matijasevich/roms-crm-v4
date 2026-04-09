import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { updateTeamMember } from "@/lib/queries/admin";
import { z } from "zod";

const updateTeamSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  rol: z.string().max(50).optional(),
  is_admin: z.boolean().optional(),
  is_closer: z.boolean().optional(),
  is_setter: z.boolean().optional(),
  is_cobranzas: z.boolean().optional(),
  is_seguimiento: z.boolean().optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
  comision_pct: z.number().min(0).max(1).optional(),
  activo: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const member = await updateTeamMember(id, parsed.data);
    return NextResponse.json(member);
  } catch (err) {
    console.error("[PATCH /api/admin/team/[id]]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
