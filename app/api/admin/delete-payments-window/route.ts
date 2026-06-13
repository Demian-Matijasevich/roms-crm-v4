import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/**
 * POST /api/admin/delete-payments-window?from=YYYY-MM-DDTHH:MM:SSZ&to=YYYY-MM-DDTHH:MM:SSZ
 * Borra payments con created_at en la ventana indicada. NO toca leads.
 * dry=1 para preview.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const dry = url.searchParams.get("dry") === "1";
  if (!from || !to) return NextResponse.json({ error: "from y to requeridos" }, { status: 400 });

  const sb = createServerClient();
  const { data: pays, error } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, created_at")
    .gte("created_at", from)
    .lte("created_at", to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (dry) {
    return NextResponse.json({
      from, to,
      count: pays?.length || 0,
      total_usd: (pays || []).reduce((s, p) => s + (p.monto_usd || 0), 0),
      sample: (pays || []).slice(0, 30),
    });
  }

  const ids = (pays || []).map((p) => p.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error: delErr } = await sb.from("payments").delete().in("id", batch);
    if (!delErr) deleted += batch.length;
  }

  return NextResponse.json({ ok: true, from, to, deleted });
}
