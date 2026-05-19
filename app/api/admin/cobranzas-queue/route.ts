import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/** Pending payments queue grouped by semaforo. ?s=X */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("payments")
    .select("id, monto_usd, fecha_vencimiento, numero_cuota, lead_id, client_id, estado")
    .eq("estado", "pendiente")
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let venc = 0, urg = 0, prox = 0, ok = 0, nulo = 0;
  let tv = 0, tu = 0, tp = 0, tok = 0;
  const next: Array<{ f: string | null; m: number; c: number | null; dd: number }> = [];

  for (const p of data || []) {
    const m = Number(p.monto_usd || 0);
    if (!p.fecha_vencimiento) { nulo++; continue; }
    const d = new Date(p.fecha_vencimiento + "T00:00:00");
    const dd = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (dd < 0) { venc++; tv += m; }
    else if (dd <= 7) { urg++; tu += m; }
    else if (dd <= 15) { prox++; tp += m; }
    else { ok++; tok += m; }
    if (dd >= -7 && dd <= 45) next.push({ f: p.fecha_vencimiento, m, c: p.numero_cuota, dd });
  }
  next.sort((a, b) => (a.f || "") < (b.f || "") ? -1 : 1);

  return NextResponse.json({
    ok: true,
    total: (data || []).length,
    vencidas: { count: venc, monto: tv },
    urgentes_7d: { count: urg, monto: tu },
    proximas_8_15d: { count: prox, monto: tp },
    ok_15d_plus: { count: ok, monto: tok },
    sin_fecha: nulo,
    detalle_45d: next.slice(0, 40),
  });
}
