import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Detecta y borra payments duplicados creados por el import.
 *
 * Para cada lead, agrupa payments por monto_usd. Si un mismo lead tiene 2+
 * payments con el mismo monto, mantiene el más antiguo (created_at) y borra
 * los demás. Solo borra duplicados creados en la última hora (más seguro).
 *
 * dry=1 para preview.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dryRun = url.searchParams.get("dry") === "1";
  const minutesBack = parseInt(url.searchParams.get("minutes") || "120");

  const sb = createServerClient();

  const sinceISO = new Date(Date.now() - minutesBack * 60 * 1000).toISOString();
  // Recent payments
  const { data: recent } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, created_at, estado")
    .gte("created_at", sinceISO)
    .eq("estado", "pagado")
    .range(0, 4999);

  if (!recent || recent.length === 0) {
    return NextResponse.json({ ok: true, message: "Sin payments recientes para revisar", since: sinceISO });
  }

  // For each recent payment, check if there's an OLDER payment with same lead_id + monto_usd
  const recentLeadIds = [...new Set(recent.map((p) => p.lead_id).filter((x): x is string => !!x))];
  if (recentLeadIds.length === 0) return NextResponse.json({ ok: true, message: "Sin lead_ids" });

  const { data: allOfThoseLeads } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, created_at, estado")
    .in("lead_id", recentLeadIds)
    .eq("estado", "pagado")
    .range(0, 9999);

  // Group by lead_id + rounded monto
  const groups = new Map<string, Array<{ id: string; lead_id: string; monto_usd: number; fecha_pago: string | null; created_at: string }>>();
  for (const p of allOfThoseLeads || []) {
    const key = `${p.lead_id}|${Math.round(p.monto_usd)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p as { id: string; lead_id: string; monto_usd: number; fecha_pago: string | null; created_at: string });
  }

  const toDelete: Array<{ id: string; lead_id: string; monto_usd: number; fecha_pago: string | null; created_at: string }> = [];
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    // Sort by created_at ASC, keep first (oldest), delete rest IF they are recent
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const keeper = arr[0];
    for (const p of arr.slice(1)) {
      if (p.created_at >= sinceISO) {
        toDelete.push(p);
      }
    }
    void keeper;
  }

  if (dryRun) {
    return NextResponse.json({
      since: sinceISO,
      recent_payments: recent.length,
      groups_with_duplicates: [...groups.values()].filter((a) => a.length > 1).length,
      to_delete: toDelete.length,
      preview: toDelete.slice(0, 30).map((p) => ({ id: p.id, lead_id: p.lead_id, monto: p.monto_usd, fecha: p.fecha_pago, created: p.created_at })),
    });
  }

  // Delete in batches
  let deleted = 0;
  const ids = toDelete.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await sb.from("payments").delete().in("id", batch);
    if (!error) deleted += batch.length;
  }

  return NextResponse.json({
    ok: true,
    deleted,
    since: sinceISO,
  });
}
