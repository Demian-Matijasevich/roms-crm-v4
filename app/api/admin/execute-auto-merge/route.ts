import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

const COPY_FIELDS = [
  "instagram", "email", "telefono", "setter_id", "closer_id", "cobrador_id",
  "utm_source", "utm_medium", "utm_content", "fuente",
  "fecha_agendado", "fecha_llamada",
  "programa_pitcheado", "concepto", "plan_pago",
  "notas_internas", "reporte_general", "contexto_setter",
  "lead_calificado", "lead_score",
  "sheets_row_index",
];

function score(l: Record<string, unknown>): number {
  let n = 0;
  for (const f of [...COPY_FIELDS, "ticket_total"]) {
    const v = l[f];
    if (v != null && v !== "" && v !== 0) n++;
  }
  return n;
}
function norm(s: string | null): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
function normIg(s: string | null): string { return (s || "").toLowerCase().replace(/^@/, "").trim(); }

const ANCHOR_STATES = new Set(["cerrado", "adentro_seguimiento", "seguimiento", "no_cierre", "no_calificado"]);

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const { data: leads } = await sb.from("leads").select("*").range(0, 9999);
  const { data: payments } = await sb.from("payments").select("lead_id");
  const payCount = new Map<string, number>();
  for (const p of payments || []) if (p.lead_id) payCount.set(p.lead_id, (payCount.get(p.lead_id) || 0) + 1);

  type L = Record<string, unknown> & { id: string; nombre: string; estado: string };

  // Build groups (same logic as analyze)
  const byEmail = new Map<string, L[]>();
  const byIg = new Map<string, L[]>();
  const byName = new Map<string, L[]>();
  for (const l of (leads || []) as L[]) {
    const e = norm(l.email as string | null);
    const i = normIg(l.instagram as string | null);
    const n = norm(l.nombre);
    if (e) (byEmail.get(e) || byEmail.set(e, []).get(e)!).push(l);
    if (i) (byIg.get(i) || byIg.set(i, []).get(i)!).push(l);
    if (n) (byName.get(n) || byName.set(n, []).get(n)!).push(l);
  }
  const seen = new Set<string>();
  const groups: { reason: string; leads: L[] }[] = [];
  for (const [, arr] of byEmail) {
    if (arr.length < 2) continue;
    const g = arr.filter(l => !seen.has(l.id));
    if (g.length < 2) continue;
    groups.push({ reason: "email", leads: g });
    g.forEach(l => seen.add(l.id));
  }
  for (const [, arr] of byIg) {
    if (arr.length < 2) continue;
    const g = arr.filter(l => !seen.has(l.id));
    if (g.length < 2) continue;
    groups.push({ reason: "instagram", leads: g });
    g.forEach(l => seen.add(l.id));
  }
  for (const [, arr] of byName) {
    if (arr.length < 2) continue;
    const g = arr.filter(l => !seen.has(l.id));
    if (g.length < 2) continue;
    groups.push({ reason: "nombre", leads: g });
    g.forEach(l => seen.add(l.id));
  }

  // Filter to AUTO_SAFE
  const autoSafe: { keepId: string; keepName: string; mergeIds: string[] }[] = [];
  for (const g of groups) {
    const enriched = g.leads.map(l => ({
      l, payments: payCount.get(l.id) || 0, score: score(l),
      isAnchor: ANCHOR_STATES.has(l.estado) || (payCount.get(l.id) || 0) > 0,
    }));
    const withPay = enriched.filter(e => e.payments > 0);
    const closedOrIn = enriched.filter(e => e.l.estado === "cerrado" || e.l.estado === "adentro_seguimiento");
    if (withPay.length > 1) continue;
    if (closedOrIn.length > 1) continue;
    if (g.reason === "nombre" && enriched.filter(e => e.isAnchor).length > 0 && enriched.length > 2) continue;

    const anchors = enriched.filter(e => e.isAnchor);
    let keeper: typeof enriched[number];
    if (anchors.length >= 1) keeper = anchors.sort((a, b) => b.score - a.score)[0];
    else keeper = enriched.sort((a, b) => b.score - a.score)[0];
    const merge = enriched.filter(e => e.l.id !== keeper.l.id);
    if (merge.length === 0) continue;
    autoSafe.push({ keepId: keeper.l.id, keepName: keeper.l.nombre, mergeIds: merge.map(e => e.l.id) });
  }

  if (dry) {
    return NextResponse.json({
      total_groups: groups.length,
      auto_safe_groups: autoSafe.length,
      total_to_merge: autoSafe.reduce((s, g) => s + g.mergeIds.length, 0),
    });
  }

  let merged = 0, paymentsMoved = 0, errors: string[] = [];
  const resyncIds: string[] = [];

  const leadById = new Map<string, L>();
  for (const l of (leads || []) as L[]) leadById.set(l.id, l);

  for (const plan of autoSafe) {
    const keeper = leadById.get(plan.keepId);
    if (!keeper) continue;
    const mergeables = plan.mergeIds.map(id => leadById.get(id)).filter((l): l is L => !!l);
    if (mergeables.length === 0) continue;

    const patch: Record<string, unknown> = {};
    for (const f of COPY_FIELDS) {
      if (keeper[f] == null || keeper[f] === "") {
        for (const m of mergeables) {
          if (m[f] != null && m[f] !== "") { patch[f] = m[f]; break; }
        }
      }
    }
    const maxTicket = Math.max((keeper.ticket_total as number) || 0, ...mergeables.map(m => (m.ticket_total as number) || 0));
    if (maxTicket > ((keeper.ticket_total as number) || 0)) patch.ticket_total = maxTicket;

    if (Object.keys(patch).length > 0) {
      await sb.from("leads").update(patch).eq("id", plan.keepId);
    }

    const { count } = await sb.from("payments").update({ lead_id: plan.keepId }, { count: "exact" }).in("lead_id", plan.mergeIds);
    if (count) paymentsMoved += count;

    const { error: delErr } = await sb.from("leads").delete().in("id", plan.mergeIds);
    if (delErr) { errors.push(`${plan.keepName}: ${delErr.message}`); continue; }

    merged += plan.mergeIds.length;
    resyncIds.push(plan.keepId);
  }

  // Resync to Sheet (parallel chunks of 5)
  for (let i = 0; i < resyncIds.length; i += 5) {
    await Promise.all(resyncIds.slice(i, i + 5).map(id => syncLeadToSheet(id).catch(() => null)));
  }

  return NextResponse.json({
    ok: true,
    total_groups: groups.length,
    auto_safe_groups: autoSafe.length,
    leads_merged: merged,
    payments_moved: paymentsMoved,
    keepers_resynced: resyncIds.length,
    errors,
  });
}
