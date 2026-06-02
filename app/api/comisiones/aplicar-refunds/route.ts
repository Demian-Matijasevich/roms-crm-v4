import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

/**
 * POST /api/comisiones/aplicar-refunds
 * Body: { payment_ids: string[], mes: "YYYY-MM" }
 *
 * Marca los payments (típicamente refunds) con aplicado_en_comisiones_mes = mes
 * para que NO se descuenten otra vez en cierres de comisiones futuros.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.payment_ids) ? body.payment_ids : [];
    const mes = String(body?.mes || "").trim();
    if (ids.length === 0 || !/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json({ error: "payment_ids[] y mes (YYYY-MM) requeridos" }, { status: 400 });
    }
    const sb = createServerClient();
    const { error, count } = await sb
      .from("payments")
      .update({ aplicado_en_comisiones_mes: mes }, { count: "exact" })
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: count || ids.length });
  } catch (err) {
    console.error("[POST /api/comisiones/aplicar-refunds]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
