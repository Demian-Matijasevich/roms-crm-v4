import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";
const GRACE_DAYS = 30;

const RENOVA_OK = new Set(["pago", "cuota_1_pagada", "cuota_2_pagada"]);

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const isCron = req.headers.get("x-vercel-cron") === "1" || (req.headers.get("user-agent") || "").includes("vercel-cron");
  if (!isCron && url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const { data: clients } = await sb
    .from("clients")
    .select("id, nombre, estado, estado_contacto, fecha_onboarding, fecha_offboarding, total_dias_programa")
    .neq("estado", "inactivo")
    .not("fecha_onboarding", "is", null);

  const { data: renewals } = await sb.from("renewal_history").select("client_id, estado");
  const clientHasRenewal = new Set(
    (renewals || []).filter((r) => r.estado && RENOVA_OK.has(r.estado)).map((r) => r.client_id)
  );

  const candidates: Array<{ id: string; nombre: string; daysOverdue: number }> = [];
  for (const c of clients || []) {
    if (!c.fecha_onboarding) continue;
    if (c.estado_contacto !== "por_contactar") continue;
    if (clientHasRenewal.has(c.id)) continue;
    const onb = new Date(c.fecha_onboarding);
    const end = new Date(onb.getTime() + (c.total_dias_programa || 90) * 86400000);
    const daysOverdue = Math.floor((today.getTime() - end.getTime()) / 86400000);
    if (daysOverdue < GRACE_DAYS) continue;
    candidates.push({ id: c.id, nombre: c.nombre, daysOverdue });
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      grace_days: GRACE_DAYS,
      total_candidates: candidates.length,
      sample: candidates.slice(0, 30),
    });
  }

  let marked = 0;
  const errors: string[] = [];
  for (const c of candidates) {
    const { error } = await sb.from("clients").update({
      estado: "inactivo",
      estado_contacto: "no_responde",
      fecha_offboarding: todayStr,
      notas_seguimiento: "[AUTO_INACTIVE] Marcado automático: programa terminado hace " + c.daysOverdue + " días sin contacto ni renovación",
    }).eq("id", c.id);
    if (error) errors.push(`${c.nombre}: ${error.message}`);
    else marked++;
  }

  return NextResponse.json({
    ok: true,
    grace_days: GRACE_DAYS,
    total_candidates: candidates.length,
    marked,
    errors: errors.slice(0, 20),
  });
}

export const POST = handler;
export const GET = handler;
