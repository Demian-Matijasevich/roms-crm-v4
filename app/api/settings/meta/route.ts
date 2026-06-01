import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSettings, setSetting } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/meta — devuelve la meta de cash y ventas mensual.
 */
export async function GET() {
  const s = await getSettings();
  return NextResponse.json({
    meta_cash_mensual_usd: Number(s.meta_cash_mensual_usd) || 0,
    meta_ventas_mensual: Number(s.meta_ventas_mensual) || 0,
  });
}

/**
 * POST /api/settings/meta — actualiza meta. Solo admin.
 * Body: { meta_cash_mensual_usd?, meta_ventas_mensual? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    if (body?.meta_cash_mensual_usd !== undefined) {
      await setSetting("meta_cash_mensual_usd", Number(body.meta_cash_mensual_usd));
    }
    if (body?.meta_ventas_mensual !== undefined) {
      await setSetting("meta_ventas_mensual", Number(body.meta_ventas_mensual));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/settings/meta]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
