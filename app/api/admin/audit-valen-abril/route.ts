import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

function computeValenCommission(
  payments: Array<{ monto: number; programa: string | null }>,
  monthlyCash: number
) {
  const mul = monthlyCash <= 70000 ? 1.0 : monthlyCash <= 100000 ? 1.15 : 1.3;
  const pctOmni = Math.min(7 * mul, 10);
  const pctMulti = Math.min(5 * mul, 10);
  const pctConsult = Math.min(7 * mul, 10);

  let omni = 0, multi = 0, consult = 0;
  for (const p of payments) {
    const prog = (p.programa || "omnipresencia").toLowerCase();
    if (prog.includes("multi")) multi += p.monto * (pctMulti / 100);
    else if (prog.includes("consult")) consult += p.monto * (pctConsult / 100);
    else omni += p.monto * (pctOmni / 100);
  }
  return {
    multiplier: mul,
    pct: { omni: pctOmni, multi: pctMulti, consult: pctConsult },
    breakdown: { omni: Math.round(omni), multi: Math.round(multi), consult: Math.round(consult) },
    total: Math.round(omni + multi + consult),
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data: valen } = await sb.from("team_members").select("id").eq("nombre", "Valentino").maybeSingle();
  if (!valen?.id) return NextResponse.json({ error: "Valentino no encontrado" }, { status: 404 });

  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, programa_pitcheado")
    .eq("closer_id", valen.id)
    .range(0, 4999);
  const progMap: Record<string, string | null> = {};
  const nameMap: Record<string, string> = {};
  for (const l of leads || []) {
    progMap[l.id] = (l.programa_pitcheado as string | null) || null;
    nameMap[l.id] = l.nombre || "—";
  }

  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .range(0, 4999);
  const leadIdSet = new Set(Object.keys(progMap));
  const matched = (pays || []).filter((p) => p.lead_id && leadIdSet.has(p.lead_id));
  const paymentsForCommission = matched.map((p) => ({ monto: p.monto_usd, programa: progMap[p.lead_id!] || null }));
  const total = matched.reduce((s, p) => s + p.monto_usd, 0);
  const commission = computeValenCommission(paymentsForCommission, total);

  const details = matched.map((p) => ({
    nombre: nameMap[p.lead_id!] || "—",
    monto: p.monto_usd,
    fecha: p.fecha_pago?.split("T")[0],
    programa: progMap[p.lead_id!] || "—",
    cuota: p.numero_cuota,
  }));

  return NextResponse.json({
    mes: "Abril 2026",
    closer: "Valentino",
    total_payments: matched.length,
    unique_leads: new Set(matched.map(p => p.lead_id)).size,
    cash_collected: total,
    commission,
    details,
  });
}
