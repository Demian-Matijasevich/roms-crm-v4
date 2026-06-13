import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/** Full trace of a lead: all columns + payments + matching utm campaign. ?s=X&q=name */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q requerido" }, { status: 400 });

  const sb = createServerClient();
  const { data: leads } = await sb.from("leads").select("*").ilike("nombre", `%${q}%`);
  const ids = (leads || []).map((l) => l.id);

  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre]));

  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, source, setter_id, closer_id");

  const { data: payments } = ids.length > 0
    ? await sb.from("payments").select("*").in("lead_id", ids).order("fecha_pago")
    : { data: [] };
  const paysByLead = new Map<string, typeof payments>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    const arr = paysByLead.get(p.lead_id) || [];
    arr.push(p);
    paysByLead.set(p.lead_id, arr);
  }

  const out = (leads || []).map((l) => {
    const med = (l.utm_medium || "").toLowerCase();
    const matchCamp = (campaigns || []).find((c) => c.medium && c.medium.toLowerCase() === med);
    return {
      id: l.id,
      nombre: l.nombre,
      programa_pitcheado: l.programa_pitcheado,
      estado: l.estado,
      ticket_total: l.ticket_total,
      fuente: l.fuente,
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_content: l.utm_content,
      closer_id: l.closer_id,
      closer: l.closer_id ? teamById.get(l.closer_id) || l.closer_id : null,
      setter_id: l.setter_id,
      setter: l.setter_id ? teamById.get(l.setter_id) || l.setter_id : null,
      utm_campaign_match: matchCamp
        ? {
            medium: matchCamp.medium,
            source: matchCamp.source,
            setter: matchCamp.setter_id ? teamById.get(matchCamp.setter_id) || matchCamp.setter_id : null,
            closer: matchCamp.closer_id ? teamById.get(matchCamp.closer_id) || matchCamp.closer_id : null,
          }
        : null,
      fecha_agendado: l.fecha_agendado,
      fecha_llamada: l.fecha_llamada,
      created_at: l.created_at,
      reporte_general: l.reporte_general,
      notas_internas: l.notas_internas,
      payments: (paysByLead.get(l.id) || []).map((p) => ({
        id: p.id,
        fecha_pago: p.fecha_pago,
        monto_usd: p.monto_usd,
        estado: p.estado,
        numero_cuota: p.numero_cuota,
        receptor: p.receptor,
        metodo_pago: p.metodo_pago,
        es_renovacion: p.es_renovacion,
        created_at: p.created_at,
        notas: p.notas,
      })),
    };
  });

  return NextResponse.json({ ok: true, count: out.length, leads: out });
}
