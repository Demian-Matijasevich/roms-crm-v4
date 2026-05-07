import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

interface PaymentRow {
  id: string;
  lead_id: string | null;
  monto_usd: number;
  monto_ars: number;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  numero_cuota: number;
  estado: string;
  metodo_pago: string | null;
  receptor: string | null;
  comprobante_url: string | null;
  cobrador_id: string | null;
  es_renovacion: boolean;
  notas: string | null;
  created_at: string;
}

/**
 * Score: cuántos campos importantes tiene populados (más = mejor).
 */
function scorePayment(p: PaymentRow): number {
  let s = 0;
  if (p.fecha_pago) s += 2;
  if (p.fecha_vencimiento) s += 1;
  if (p.metodo_pago) s += 2;
  if (p.receptor) s += 2;
  if (p.comprobante_url) s += 3;
  if (p.cobrador_id) s += 1;
  if (p.numero_cuota > 0) s += 1;
  return s;
}

/**
 * Detecta y deduplica payments duplicados.
 * Criterio: mismo lead_id (no null), mismo monto_usd (±$1), mismo numero_cuota,
 * fecha_pago dentro de ±3 días.
 *
 * Para cada grupo: elige el "mejor" (más campos populados / más reciente)
 * y marca los demás con estado='perdido' + notas='[DUPLICATE_OF=<id>]'.
 *
 * Query params:
 *   - s=<secret> obligatorio
 *   - dry=1 → solo lista candidatos
 *   - mes=YYYY-MM → filtrar a un mes específico (default: todos)
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";
  const mes = url.searchParams.get("mes");

  const sb = createServerClient();
  let query = sb
    .from("payments")
    .select("id, lead_id, monto_usd, monto_ars, fecha_pago, fecha_vencimiento, numero_cuota, estado, metodo_pago, receptor, comprobante_url, cobrador_id, es_renovacion, notas, created_at")
    .eq("estado", "pagado")
    .not("lead_id", "is", null);
  if (mes) {
    query = query.gte("fecha_pago", `${mes}-01`).lte("fecha_pago", `${mes}-31`);
  }
  const { data: payments, error } = await query.range(0, 9999);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Agrupar: lead_id + numero_cuota + monto rounded
  const groups = new Map<string, PaymentRow[]>();
  for (const p of (payments ?? []) as PaymentRow[]) {
    const key = `${p.lead_id}_${p.numero_cuota}_${Math.round(p.monto_usd)}`;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  }

  // Filtrar grupos con > 1 con fechas cercanas (±3 días)
  const dupGroups: Array<{ winner: PaymentRow; losers: PaymentRow[]; key: string }> = [];
  const DAY = 86400000;
  for (const [key, arr] of groups.entries()) {
    if (arr.length <= 1) continue;
    // Sub-clusters por fecha cercana
    const remaining = [...arr];
    while (remaining.length > 0) {
      const seed = remaining.shift()!;
      const cluster = [seed];
      const seedTime = seed.fecha_pago ? new Date(seed.fecha_pago).getTime() : 0;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const o = remaining[i];
        const oTime = o.fecha_pago ? new Date(o.fecha_pago).getTime() : 0;
        if (Math.abs(seedTime - oTime) <= 3 * DAY) {
          cluster.push(o);
          remaining.splice(i, 1);
        }
      }
      if (cluster.length > 1) {
        // Elegir winner: mayor score, desempate created_at más reciente
        cluster.sort((a, b) => {
          const sa = scorePayment(a);
          const sb_ = scorePayment(b);
          if (sa !== sb_) return sb_ - sa;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        const [winner, ...losers] = cluster;
        dupGroups.push({ winner, losers, key });
      }
    }
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      total_groups: dupGroups.length,
      total_duplicates_to_mark: dupGroups.reduce((s, g) => s + g.losers.length, 0),
      total_amount_inflated: dupGroups.reduce((s, g) => s + g.losers.reduce((ss, l) => ss + l.monto_usd, 0), 0),
      sample: dupGroups.slice(0, 30).map((g) => ({
        winner_id: g.winner.id,
        winner_score: scorePayment(g.winner),
        winner_fecha: g.winner.fecha_pago,
        winner_monto: g.winner.monto_usd,
        winner_receptor: g.winner.receptor,
        losers_count: g.losers.length,
        losers_ids: g.losers.map((l) => l.id),
        losers_total: g.losers.reduce((s, l) => s + l.monto_usd, 0),
      })),
    });
  }

  let marked = 0;
  const errors: string[] = [];
  for (const g of dupGroups) {
    for (const l of g.losers) {
      const note = `[DUPLICATE_OF=${g.winner.id}] originally estado=${l.estado} on ${new Date().toISOString().slice(0, 10)}`;
      const { error: e } = await sb
        .from("payments")
        .update({
          estado: "perdido",
          notas: l.notas ? `${l.notas}\n${note}` : note,
        })
        .eq("id", l.id);
      if (e) errors.push(`${l.id}: ${e.message}`);
      else marked++;
    }
  }

  return NextResponse.json({
    ok: true,
    total_groups: dupGroups.length,
    marked,
    errors: errors.slice(0, 30),
  });
}

/**
 * GET → lista los duplicados ya marcados (estado=perdido + notas con DUPLICATE_OF)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, receptor, metodo_pago, notas, lead:leads(nombre)")
    .like("notas", "%DUPLICATE_OF%")
    .order("fecha_pago", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data?.length || 0, duplicados: data ?? [] });
}
