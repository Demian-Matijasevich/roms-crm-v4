import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createPaymentMethod } from "@/lib/queries/admin";
import { z } from "zod";

const createMethodSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  titular: z.string().optional().default(""),
  tipo_moneda: z.enum(["ars", "usd"]).default("usd"),
  cbu: z.string().optional().default(""),
  alias_cbu: z.string().optional().default(""),
  banco: z.string().optional().default(""),
  id_cuenta: z.string().optional().default(""),
  observaciones: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const parsed = createMethodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const method = await createPaymentMethod(parsed.data);
    return NextResponse.json(method, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/payment-methods]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
