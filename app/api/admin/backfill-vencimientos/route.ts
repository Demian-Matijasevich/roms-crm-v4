import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/**
 * Backfill fecha_vencimiento de cuotas pendientes que no la tienen cargada.
 * Lógica: para cada lead, ordenar sus pagos por numero_cuota, usar fecha_pago de la primera cuota
 * (o fecha_llamada del lead) como anchor, y sumar 30 días por cuota siguiente.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const { data: payments } = await sb
    .from("payments")
    .select("id, lead_id, numero_cuota, fecha_pago, fecha_vencimiento, estado")
    .order("numero_cuota");
  if (!payments) return NextResponse.json({ error: "no payments" }, { status: 500 });

  const { data: leads } = await sb
    .from("leads")
    .select("id, fecha_llamada, fecha_agendado");
  const leadById = new Map<string, { id: string; fecha_llamada: string | null; fecha_agendado: string | null }>();
  for (const l of leads || []) leadById.set(l.id, l);

  // Group payments by lead
  const byLead = new Map<string, typeof payments>();
  for (const p of payments) {
    if (!p.lead_id) continue;
    const arr = byLead.get(p.lead_id) || [];
    arr.push(p);
    byLead.set(p.lead_id, arr);
  }

  const updates: Array<{ id: string; fecha_vencimiento: string }> = [];
  const DAY = 86400000;

  for (const [leadId, leadPays] of byLead.entries()) {
    leadPays.sort((a, b) => (a.numero_cuota || 1) - (b.numero_cuota || 1));
    // Anchor: primera cuota fecha_pago, sino fecha_llamada del lead
    const firstPay = leadPays[0];
    let anchor: Date | null = null;
    if (firstPay?.fecha_pago) anchor = new Date(firstPay.fecha_pago.split("T")[0]);
    else {
      const lead = leadById.get(leadId);
      if (lead?.fecha_llamada) anchor = new Date(lead.fecha_llamada.split("T")[0]);
      else if (lead?.fecha_agendado) anchor = new Date(lead.fecha_agendado.split("T")[0]);
    }
    if (!anchor) continue;

    for (const p of leadPays) {
      if (p.fecha_vencimiento) continue; // ya tiene
      const cuota = p.numero_cuota || 1;
      // cuota 1 → mismo día anchor; cuota 2 → +30 días; cuota 3 → +60; etc.
      const venc = new Date(anchor.getTime() + (cuota - 1) * 30 * DAY);
      const vencStr = venc.toISOString().slice(0, 10);
      updates.push({ id: p.id, fecha_vencimiento: vencStr });
    }
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
    const { error } = await sb.from("payments").update({ fecha_vencimiento: u.fecha_vencimiento }).eq("id", u.id);
    if (error) errors.push(`${u.id}: ${error.message}`);
    else updated++;
  }
  return NextResponse.json({ ok: true, updated, errors: errors.slice(0, 20), total_attempted: updates.length });
}
