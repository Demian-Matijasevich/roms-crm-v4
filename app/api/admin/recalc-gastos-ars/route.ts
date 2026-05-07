import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getUsdRate } from "@/lib/queries/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Recalcula monto_usd de gastos viejos que tienen monto_ars > 0 pero monto_usd = 0
 * usando el rate del mes del gasto (usd_rate_history) o el global como fallback.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const { data: gastos, error } = await sb
    .from("gastos")
    .select("id, fecha, monto_usd, monto_ars, usd_rate_aplicado")
    .gt("monto_ars", 0);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: rates } = await sb.from("usd_rate_history").select("mes, rate");
  const rateByMes = new Map<string, number>();
  for (const r of rates || []) rateByMes.set(r.mes, Number(r.rate));
  const globalRate = await getUsdRate();

  const updates: Array<{ id: string; mes: string; rate: number; monto_ars: number; monto_usd: number }> = [];
  for (const g of gastos || []) {
    if ((g.monto_usd || 0) > 0) continue; // ya tiene USD cargado, no tocar
    const mes = String(g.fecha || "").slice(0, 7);
    const rate = rateByMes.get(mes) || globalRate;
    if (rate <= 0) continue;
    const newUsd = +(Number(g.monto_ars) / rate).toFixed(2);
    if (newUsd <= 0) continue;
    updates.push({ id: g.id, mes, rate, monto_ars: g.monto_ars, monto_usd: newUsd });
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      total_candidates: updates.length,
      sample: updates.slice(0, 30),
    });
  }

  let updated = 0;
  const errors: string[] = [];
  for (const u of updates) {
    const { error: e } = await sb
      .from("gastos")
      .update({ monto_usd: u.monto_usd, usd_rate_aplicado: u.rate })
      .eq("id", u.id);
    if (e) errors.push(`${u.id}: ${e.message}`);
    else updated++;
  }
  return NextResponse.json({ ok: true, updated, errors: errors.slice(0, 30), total_attempted: updates.length });
}
