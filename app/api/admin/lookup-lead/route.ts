import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q requerido" }, { status: 400 });

  const sb = createServerClient();
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, programa_pitcheado, ticket_total, estado, fecha_llamada, closer_id, setter_id, utm_medium")
    .ilike("nombre", `%${q}%`);

  const ids = (leads || []).map((l) => l.id);
  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre]));

  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns || []) if (c.setter_id && c.medium) mediumToSetter.set(c.medium.toLowerCase(), c.setter_id);

  const { data: payments } = ids.length > 0
    ? await sb.from("payments").select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, es_renovacion, receptor")
        .in("lead_id", ids).order("fecha_pago")
    : { data: [] };
  const paysByLead = new Map<string, typeof payments>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    const arr = paysByLead.get(p.lead_id) || [];
    arr.push(p);
    paysByLead.set(p.lead_id, arr);
  }

  const out = (leads || []).map((l) => {
    const closer = l.closer_id ? teamById.get(l.closer_id) : null;
    let setterId = l.setter_id || null;
    if (!setterId && l.utm_medium) setterId = mediumToSetter.get(l.utm_medium.toLowerCase()) || null;
    const setter = setterId ? teamById.get(setterId) : null;
    const pays = paysByLead.get(l.id) || [];
    return {
      nombre: l.nombre,
      programa: l.programa_pitcheado,
      ticket: l.ticket_total,
      estado: l.estado,
      closer: closer || null,
      setter: setter || null,
      total_pagado: pays.filter((p) => p.estado === "pagado").reduce((s, p) => s + Number(p.monto_usd || 0), 0),
      total_refund: pays.filter((p) => p.estado === "refund").reduce((s, p) => s + Number(p.monto_usd || 0), 0),
      payments: pays.map((p) => ({ fecha: p.fecha_pago, monto: p.monto_usd, estado: p.estado, cuota: p.numero_cuota, receptor: p.receptor, es_renovacion: p.es_renovacion })),
    };
  });

  return NextResponse.json({ ok: true, count: out.length, leads: out });
}
