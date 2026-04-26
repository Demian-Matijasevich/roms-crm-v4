import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const minutesBack = parseInt(url.searchParams.get("minutes") || "240");
  const dry = url.searchParams.get("dry") === "1";
  const fromTS = url.searchParams.get("from"); // ISO timestamp
  const toTS = url.searchParams.get("to"); // ISO timestamp

  const sb = createServerClient();
  const sinceISO = fromTS || new Date(Date.now() - minutesBack * 60 * 1000).toISOString();

  // Find payments in window
  let payQuery = sb
    .from("payments")
    .select("id, lead_id, monto_usd, created_at")
    .gte("created_at", sinceISO)
    .eq("estado", "pagado");
  if (toTS) payQuery = payQuery.lte("created_at", toTS);
  const { data: recentPays } = await payQuery;

  // Find recent leads (newly created by import) — within same window
  let leadsQuery = sb
    .from("leads")
    .select("id, nombre, created_at")
    .gte("created_at", sinceISO);
  if (toTS) leadsQuery = leadsQuery.lte("created_at", toTS);
  const { data: recentLeads } = await leadsQuery;

  if (dry) {
    return NextResponse.json({
      since: sinceISO,
      payments_to_delete: recentPays?.length || 0,
      leads_to_delete: recentLeads?.length || 0,
      sample_pays: (recentPays || []).slice(0, 10),
      sample_leads: (recentLeads || []).slice(0, 10),
    });
  }

  // Delete payments first
  const payIds = (recentPays || []).map((p) => p.id);
  let paysDeleted = 0;
  for (let i = 0; i < payIds.length; i += 100) {
    const batch = payIds.slice(i, i + 100);
    const { error } = await sb.from("payments").delete().in("id", batch);
    if (!error) paysDeleted += batch.length;
  }

  // Delete leads (only ones with no remaining payments to be safe)
  const leadIds = (recentLeads || []).map((l) => l.id);
  let leadsDeleted = 0;
  for (const id of leadIds) {
    // Re-check if any payment still points to this lead (other recent ones besides the ones we just deleted)
    const { data: stillHas } = await sb.from("payments").select("id").eq("lead_id", id).limit(1);
    if (stillHas && stillHas.length > 0) continue;
    const { error } = await sb.from("leads").delete().eq("id", id);
    if (!error) leadsDeleted++;
  }

  return NextResponse.json({
    ok: true,
    since: sinceISO,
    payments_deleted: paysDeleted,
    leads_deleted: leadsDeleted,
  });
}
