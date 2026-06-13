import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/**
 * Para renovaciones con monto_total=0 y/o programa_anterior nulo,
 * infiere los valores desde el cliente original y su lead asociado.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const { data: renewals } = await sb
    .from("renewal_history")
    .select("id, client_id, tipo_renovacion, programa_anterior, programa_nuevo, monto_total, plan_pago, estado, fecha_renovacion");
  if (!renewals) return NextResponse.json({ error: "no renewals" }, { status: 500 });

  const { data: clients } = await sb.from("clients").select("id, lead_id, programa");
  const { data: leads } = await sb.from("leads").select("id, ticket_total, plan_pago, programa_pitcheado");

  const clientById = new Map<string, { id: string; lead_id: string | null; programa: string | null }>();
  for (const c of clients || []) clientById.set(c.id, c);
  const leadById = new Map<string, { id: string; ticket_total: number; plan_pago: string | null; programa_pitcheado: string | null }>();
  for (const l of leads || []) leadById.set(l.id, l);

  const updates: Array<Record<string, unknown>> = [];
  for (const r of renewals) {
    const client = clientById.get(r.client_id);
    if (!client) continue;
    const lead = client.lead_id ? leadById.get(client.lead_id) : null;
    const patch: Record<string, unknown> = {};
    let needs = false;

    if ((r.monto_total || 0) === 0 && lead?.ticket_total) {
      patch.monto_total = lead.ticket_total;
      needs = true;
    }
    if (!r.programa_anterior && (client.programa || lead?.programa_pitcheado)) {
      patch.programa_anterior = client.programa || lead?.programa_pitcheado;
      needs = true;
    }
    if (!r.programa_nuevo && (client.programa || lead?.programa_pitcheado)) {
      patch.programa_nuevo = client.programa || lead?.programa_pitcheado;
      needs = true;
    }
    if (!r.plan_pago && lead?.plan_pago) {
      patch.plan_pago = lead.plan_pago;
      needs = true;
    }
    if (!r.tipo_renovacion) {
      patch.tipo_renovacion = "resell";
      needs = true;
    }
    if (needs) updates.push({ id: r.id, ...patch });
  }

  if (dry) return NextResponse.json({ ok: true, dry_run: true, total_candidates: updates.length, sample: updates.slice(0, 30) });

  let updated = 0;
  const errors: string[] = [];
  for (const u of updates) {
    const id = u.id as string;
    delete u.id;
    const { error } = await sb.from("renewal_history").update(u).eq("id", id);
    if (error) errors.push(`${id}: ${error.message}`);
    else updated++;
  }
  return NextResponse.json({ ok: true, updated, errors: errors.slice(0, 20), total_attempted: updates.length });
}
