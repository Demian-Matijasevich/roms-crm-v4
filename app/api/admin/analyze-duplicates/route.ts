import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Analiza duplicados y los clasifica en:
 *   AUTO_SAFE: claros para fusionar automáticamente.
 *     - Mismo email/IG.
 *     - Diferencia de data: solo uno tiene info útil O ambos similares pero uno tiene pago/cerrado.
 *   MANUAL: requieren revisión humana.
 *     - Ambos con pagos (riesgo de pisar plata).
 *     - Ambos con estado cerrado/adentro_seguimiento (ambos válidos).
 *     - Match solo por nombre similar (ambiguo).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data: leads } = await sb.from("leads").select("*").range(0, 9999);
  const { data: payments } = await sb.from("payments").select("lead_id");
  const payCount = new Map<string, number>();
  for (const p of payments || []) if (p.lead_id) payCount.set(p.lead_id, (payCount.get(p.lead_id) || 0) + 1);

  type L = Record<string, unknown> & { id: string; nombre: string; estado: string };

  function norm(s: string | null): string {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }
  function normIg(s: string | null): string { return (s || "").toLowerCase().replace(/^@/, "").trim(); }

  // Score data completeness
  function score(l: L): number {
    const fields = ["email", "telefono", "instagram", "fecha_llamada", "fecha_agendado", "setter_id", "closer_id", "ticket_total", "programa_pitcheado", "utm_source"];
    let n = 0;
    for (const f of fields) {
      const v = l[f];
      if (v != null && v !== "" && v !== 0) n++;
    }
    return n;
  }

  const ANCHOR_STATES = new Set(["cerrado", "adentro_seguimiento", "seguimiento", "no_cierre", "no_calificado"]);
  function isAnchor(l: L): boolean {
    return ANCHOR_STATES.has(l.estado) || (payCount.get(l.id) || 0) > 0;
  }

  // Build groups by email > ig > nombre (unique buckets, prioritizing strongest match)
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
  const groups: { reason: "email" | "instagram" | "nombre"; key: string; leads: L[] }[] = [];
  for (const [k, arr] of byEmail) {
    if (arr.length < 2) continue;
    const g = arr.filter(l => !seen.has(l.id));
    if (g.length < 2) continue;
    groups.push({ reason: "email", key: k, leads: g });
    g.forEach(l => seen.add(l.id));
  }
  for (const [k, arr] of byIg) {
    if (arr.length < 2) continue;
    const g = arr.filter(l => !seen.has(l.id));
    if (g.length < 2) continue;
    groups.push({ reason: "instagram", key: k, leads: g });
    g.forEach(l => seen.add(l.id));
  }
  for (const [k, arr] of byName) {
    if (arr.length < 2) continue;
    const g = arr.filter(l => !seen.has(l.id));
    if (g.length < 2) continue;
    groups.push({ reason: "nombre", key: k, leads: g });
    g.forEach(l => seen.add(l.id));
  }

  const autoSafe: Array<{ reason: string; key: string; keep: { id: string; nombre: string; score: number; estado: string; payments: number }; merge: Array<{ id: string; nombre: string; score: number; estado: string; payments: number }> }> = [];
  const manual: Array<{ reason: string; key: string; reasonManual: string; leads: Array<{ id: string; nombre: string; score: number; estado: string; payments: number; email: string | null; instagram: string | null; fecha: string | null }> }> = [];

  for (const g of groups) {
    const enriched = g.leads.map(l => ({
      l,
      payments: payCount.get(l.id) || 0,
      score: score(l),
      isAnchor: isAnchor(l),
    }));

    const anchors = enriched.filter(e => e.isAnchor);
    const withPay = enriched.filter(e => e.payments > 0);
    const closedOrIn = enriched.filter(e => e.l.estado === "cerrado" || e.l.estado === "adentro_seguimiento");

    // MANUAL si:
    //   2+ leads con pagos (riesgo de pisar plata)
    //   2+ leads con estado cerrado/adentro_seguimiento
    //   reason === "nombre" (match por nombre puro es ambiguo)
    let manualReason: string | null = null;
    if (withPay.length > 1) manualReason = "ambos_con_pagos";
    else if (closedOrIn.length > 1) manualReason = "ambos_cerrados";
    else if (g.reason === "nombre" && anchors.length > 0 && enriched.length > 2) manualReason = "match_solo_por_nombre_y_grupo_grande";

    if (manualReason) {
      manual.push({
        reason: g.reason,
        key: g.key,
        reasonManual: manualReason,
        leads: enriched.map(e => ({
          id: e.l.id,
          nombre: e.l.nombre,
          score: e.score,
          estado: e.l.estado,
          payments: e.payments,
          email: (e.l.email as string | null) || null,
          instagram: (e.l.instagram as string | null) || null,
          fecha: ((e.l.fecha_llamada || e.l.fecha_agendado) as string | null)?.split("T")[0] || null,
        })),
      });
      continue;
    }

    // AUTO_SAFE: keeper = anchor con más score (o lead con más score si no hay anchor)
    let keeper: typeof enriched[number];
    let mergeables: typeof enriched;
    if (anchors.length >= 1) {
      keeper = anchors.sort((a, b) => b.score - a.score)[0];
      mergeables = enriched.filter(e => e.l.id !== keeper.l.id);
    } else {
      const sorted = enriched.sort((a, b) => b.score - a.score);
      keeper = sorted[0];
      mergeables = sorted.slice(1);
    }
    if (mergeables.length === 0) continue;

    autoSafe.push({
      reason: g.reason,
      key: g.key,
      keep: { id: keeper.l.id, nombre: keeper.l.nombre, score: keeper.score, estado: keeper.l.estado, payments: keeper.payments },
      merge: mergeables.map(e => ({ id: e.l.id, nombre: e.l.nombre, score: e.score, estado: e.l.estado, payments: e.payments })),
    });
  }

  return NextResponse.json({
    total_groups: groups.length,
    auto_safe_count: autoSafe.length,
    auto_safe_total_to_merge: autoSafe.reduce((s, g) => s + g.merge.length, 0),
    manual_count: manual.length,
    auto_safe: autoSafe.slice(0, 50),
    manual_review: manual.slice(0, 50),
    auto_safe_full: autoSafe.length, // full count
    manual_full: manual.length,
  });
}
