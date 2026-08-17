/**
 * GET /api/admin/pagos-wa-sync
 *
 * Wrapper admin-authenticated que dispara el cron pagos-wa-sync usando el token del server.
 * Existe para que Mel/Juanma/Fran puedan sincronizar los pagos WA a demanda sin necesidad
 * del token cron. La lógica y la idempotencia viven en /api/cron/pagos-wa-sync.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const token = process.env.EOD_CRON_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "EOD_CRON_TOKEN missing" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const target = `${origin}/api/cron/pagos-wa-sync?token=${encodeURIComponent(token)}`;
  const r = await fetch(target, { headers: { Accept: "application/json" } });
  const body = await r.text();
  return new NextResponse(body, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
  });
}
