import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

// Fields to preserve / copy when merging
const COPY_FIELDS = [
  "instagram", "email", "telefono", "setter_id", "closer_id", "cobrador_id",
  "utm_source", "utm_medium", "utm_content", "fuente",
  "fecha_agendado", "fecha_llamada",
  "programa_pitcheado", "concepto", "plan_pago",
  "notas_internas", "reporte_general", "contexto_setter",
  "lead_calificado", "lead_score",
  "sheets_row_index",
];

// Score a lead by how many relevant fields are populated
function dataScore(l: Record<string, unknown>): number {
  let n = 0;
  for (const k of [...COPY_FIELDS, "ticket_total"]) {
    const v = l[k];
    if (v != null && v !== "" && v !== 0) n++;
  }
  return n;
}

function normEmail(s: string | null): string { return (s || "").toLowerCase().trim(); }
function normIg(s: string | null): string { return (s || "").toLowerCase().replace(/^@/, "").trim(); }
function normName(s: string | null): string { return (s || "").toLowerCase().trim(); }

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dryRun = url.searchParams.get("dry") === "1";

  const sb = createServerClient();

  // Fetch all leads + payment counts
  const { data: leads, error: le } = await sb.from("leads").select("*").range(0, 9999);
  if (le) return NextResponse.json({ error: "leads: " + le.message }, { status: 500 });

  const { data: payments } = await sb.from("payments").select("lead_id");
  const payCountByLead = new Map<string, number>();
  for (const p of payments || []) {
    if (p.lead_id) payCountByLead.set(p.lead_id, (payCountByLead.get(p.lead_id) || 0) + 1);
  }

  // Build dup groups by email -> ig -> nombre (priority)
  type L = Record<string, unknown> & { id: string; estado: string };
  const byEmail = new Map<string, L[]>();
  const byIg = new Map<string, L[]>();
  const byName = new Map<string, L[]>();
  for (const l of (leads || []) as L[]) {
    const e = normEmail(l.email as string | null); if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e)!.push(l); }
    const i = normIg(l.instagram as string | null); if (i) { if (!byIg.has(i)) byIg.set(i, []); byIg.get(i)!.push(l); }
    const n = normName(l.nombre as string | null); if (n) { if (!byName.has(n)) byName.set(n, []); byName.get(n)!.push(l); }
  }

  // Collect unique groups — prefer email, then ig, then nombre
  const processedLeadIds = new Set<string>();
  const groups: { key: string; reason: string; leads: L[] }[] = [];
  for (const [k, arr] of byEmail) {
    if (arr.length < 2) continue;
    const g = arr.filter((l) => !processedLeadIds.has(l.id));
    if (g.length < 2) continue;
    groups.push({ key: `email:${k}`, reason: "email", leads: g });
    for (const l of g) processedLeadIds.add(l.id);
  }
  for (const [k, arr] of byIg) {
    if (arr.length < 2) continue;
    const g = arr.filter((l) => !processedLeadIds.has(l.id));
    if (g.length < 2) continue;
    groups.push({ key: `ig:${k}`, reason: "instagram", leads: g });
    for (const l of g) processedLeadIds.add(l.id);
  }
  for (const [k, arr] of byName) {
    if (arr.length < 2) continue;
    const g = arr.filter((l) => !processedLeadIds.has(l.id));
    if (g.length < 2) continue;
    groups.push({ key: `name:${k}`, reason: "nombre", leads: g });
    for (const l of g) processedLeadIds.add(l.id);
  }

  // Plan: per group, pick keeper and mergeables
  const plan: Array<{
    reason: string;
    key: string;
    keeper: { id: string; nombre: string; estado: string; score: number; payments: number };
    merge: Array<{ id: string; nombre: string; estado: string; score: number; payments: number }>;
    skipped_anchors?: Array<{ id: string; nombre: string; estado: string }>;
  }> = [];

  for (const g of groups) {
    const enriched = g.leads.map((l) => ({
      lead: l,
      payments: payCountByLead.get(l.id) || 0,
      score: dataScore(l),
      isAnchor: l.estado !== "pendiente" || (payCountByLead.get(l.id) || 0) > 0,
    }));

    const anchors = enriched.filter((e) => e.isAnchor);
    const pendientes = enriched.filter((e) => !e.isAnchor);

    let keeperPick: typeof enriched[number] | null = null;
    let toMerge: typeof enriched = [];

    if (anchors.length >= 1) {
      // Keeper = anchor with most data. Merge only the pendientes.
      keeperPick = anchors.sort((a, b) => b.score - a.score)[0];
      toMerge = pendientes;
      plan.push({
        reason: g.reason,
        key: g.key,
        keeper: { id: keeperPick.lead.id, nombre: keeperPick.lead.nombre as string, estado: keeperPick.lead.estado, score: keeperPick.score, payments: keeperPick.payments },
        merge: toMerge.map((e) => ({ id: e.lead.id, nombre: e.lead.nombre as string, estado: e.lead.estado, score: e.score, payments: e.payments })),
        skipped_anchors: anchors.length > 1
          ? anchors.filter((a) => a.lead.id !== keeperPick!.lead.id).map((a) => ({ id: a.lead.id, nombre: a.lead.nombre as string, estado: a.lead.estado }))
          : undefined,
      });
    } else if (pendientes.length >= 2) {
      // Sin anchor: keeper = pendiente con más data. Merge el resto.
      const sorted = pendientes.sort((a, b) => b.score - a.score);
      keeperPick = sorted[0];
      toMerge = sorted.slice(1);
      plan.push({
        reason: g.reason,
        key: g.key,
        keeper: { id: keeperPick.lead.id, nombre: keeperPick.lead.nombre as string, estado: keeperPick.lead.estado, score: keeperPick.score, payments: keeperPick.payments },
        merge: toMerge.map((e) => ({ id: e.lead.id, nombre: e.lead.nombre as string, estado: e.lead.estado, score: e.score, payments: e.payments })),
      });
    }
    // Else: only 1 anchor + 0 pendientes — nothing to merge. Skip.
  }

  const totalToMerge = plan.reduce((s, p) => s + p.merge.length, 0);

  if (dryRun) {
    return NextResponse.json({
      groups_con_duplicados: plan.length,
      leads_a_mergear: totalToMerge,
      preview: plan.slice(0, 30),
    });
  }

  // Execute
  let merged = 0, paymentsMoved = 0, errors: string[] = [];
  const resyncIds = new Set<string>();

  for (const p of plan) {
    if (p.merge.length === 0) continue;
    const keepId = p.keeper.id;
    const mergeIds = p.merge.map((m) => m.id);

    // Fetch fresh keeper + mergeables
    const { data: keeper } = await sb.from("leads").select("*").eq("id", keepId).maybeSingle();
    const { data: mergeables } = await sb.from("leads").select("*").in("id", mergeIds);
    if (!keeper || !mergeables || mergeables.length === 0) continue;

    // Fill null fields on keeper from mergeables
    const patch: Record<string, unknown> = {};
    for (const f of COPY_FIELDS) {
      const kv = (keeper as Record<string, unknown>)[f];
      if (kv == null || kv === "") {
        for (const m of mergeables as Record<string, unknown>[]) {
          const mv = m[f];
          if (mv != null && mv !== "") { patch[f] = mv; break; }
        }
      }
    }
    const maxTicket = Math.max((keeper as Record<string, unknown>).ticket_total as number || 0, ...mergeables.map((m) => (m as Record<string, unknown>).ticket_total as number || 0));
    if (maxTicket > ((keeper as Record<string, unknown>).ticket_total as number || 0)) patch.ticket_total = maxTicket;

    if (Object.keys(patch).length > 0) {
      await sb.from("leads").update(patch).eq("id", keepId);
    }

    // Move payments
    const { count } = await sb
      .from("payments")
      .update({ lead_id: keepId }, { count: "exact" })
      .in("lead_id", mergeIds);
    if (count) paymentsMoved += count;

    // Delete mergeables
    const { error: delErr } = await sb.from("leads").delete().in("id", mergeIds);
    if (delErr) { errors.push(`group ${p.key}: ${delErr.message}`); continue; }

    merged += mergeIds.length;
    resyncIds.add(keepId);
  }

  // Resync keepers to Sheet (best-effort, parallel in chunks of 5)
  const ids = [...resyncIds];
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map((id) => syncLeadToSheet(id).catch(() => null)));
  }

  return NextResponse.json({
    ok: true,
    groups_procesados: plan.length,
    leads_mergeados: merged,
    pagos_movidos: paymentsMoved,
    keepers_resincronizados: ids.length,
    errors,
  });
}
