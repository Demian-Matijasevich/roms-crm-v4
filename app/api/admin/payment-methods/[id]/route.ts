import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { updatePaymentMethod } from "@/lib/queries/admin";
import { z } from "zod";

const updateMethodSchema = z.object({
  nombre: z.string().min(1).optional(),
  titular: z.string().optional(),
  tipo_moneda: z.enum(["ars", "usd"]).optional(),
  cbu: z.string().optional(),
  alias_cbu: z.string().optional(),
  banco: z.string().optional(),
  id_cuenta: z.string().optional(),
  observaciones: z.string().optional(),
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
    const parsed = updateMethodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const method = await updatePaymentMethod(id, parsed.data);
    return NextResponse.json(method);
  } catch (err) {
    console.error("[PATCH /api/admin/payment-methods/[id]]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
