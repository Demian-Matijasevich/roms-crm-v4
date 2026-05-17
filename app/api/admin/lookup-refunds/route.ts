import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const mes = url.searchParams.get("mes");

  const sb = createServerClient();
  let q = sb.from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, receptor, metodo_pago, notas")
    .eq("estado", "refund")
    .order("fecha_pago", { ascending: false });
  if (mes) q = q.gte("fecha_pago", `${mes}-01`).lte("fecha_pago", `${mes}-31`);
  const { data: refunds } = await q;

  // Enrich with lead + closer/setter info
  const leadIds = [...new Set((refunds || []).map((r) => r.lead_id).filter(Boolean) as string[])];
  let leadsInfo: Array<{ id: string; nombre: string; programa_pitcheado: string | null; closer_id: string | null; setter_id: string | null; utm_medium: string | null }> = [];
  if (leadIds.length > 0) {
    const { data } = await sb.from("leads").select("id, nombre, programa_pitcheado, closer_id, setter_id, utm_medium").in("id", leadIds);
    leadsInfo = data || [];
  }
  const leadById = new Map(leadsInfo.map((l) => [l.id, l]));

  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre]));

  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns || []) if (c.setter_id && c.medium) mediumToSetter.set(c.medium.toLowerCase(), c.setter_id);

  const out = (refunds || []).map((r) => {
    const lead = r.lead_id ? leadById.get(r.lead_id) : null;
    const closerName = lead?.closer_id ? teamById.get(lead.closer_id) || "?" : null;
    let setterId = lead?.setter_id || null;
    if (!setterId && lead?.utm_medium) {
      setterId = mediumToSetter.get(lead.utm_medium.toLowerCase()) || null;
    }
    const setterName = setterId ? teamById.get(setterId) || "?" : null;
    return {
      id: r.id,
      fecha: r.fecha_pago,
      monto: r.monto_usd,
      cuota: r.numero_cuota,
      receptor: r.receptor,
      metodo: r.metodo_pago,
      lead: lead?.nombre || "(sin lead)",
      programa: lead?.programa_pitcheado || null,
      closer: closerName,
      setter: setterName,
      notas: r.notas,
    };
  });

  return NextResponse.json({ ok: true, count: out.length, refunds: out });
}
