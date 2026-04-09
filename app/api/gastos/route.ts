import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gastos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const body = await req.json();
    const { fecha, concepto, categoria, monto_usd, monto_ars, billetera, pagado_a, pagado_por, estado } = body;

    if (!fecha || !concepto) {
      return NextResponse.json({ error: "fecha y concepto son requeridos" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("gastos")
      .insert({
        fecha,
        concepto,
        categoria: categoria || null,
        monto_usd: monto_usd || 0,
        monto_ars: monto_ars || 0,
        billetera: billetera || null,
        pagado_a: pagado_a || null,
        pagado_por: pagado_por || null,
        estado: estado || "pagado",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, gasto: data });
  } catch (err) {
    console.error("[POST /api/gastos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
