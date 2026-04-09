import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { z } from "zod";

const renewalSchema = z.object({
  client_id: z.string().uuid(),
  tipo_renovacion: z.string().min(1),
  programa_anterior: z.string().nullable(),
  programa_nuevo: z.string().nullable(),
  monto_total: z.number().min(0),
  plan_pago: z.string().nullable(),
  estado: z.string().nullable(),
  fecha_renovacion: z.string().nullable(),
  responsable_id: z.string().uuid().nullable(),
});

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const parsed = renewalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("renewal_history")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
