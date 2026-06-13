import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const desde = url.searchParams.get("desde") || "2026-04-01";
  const hasta = url.searchParams.get("hasta") || "2026-04-30";

  const sb = createServerClient();

  // Find Igna's id
  const { data: igna } = await sb.from("team_members").select("id, nombre").ilike("nombre", "Igna").maybeSingle();
  if (!igna) return NextResponse.json({ error: "Igna no encontrado en team_members" }, { status: 404 });

  // UTM campaigns mapped to Igna
  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, source, content").eq("setter_id", igna.id);

  // Leads with setter_id = Igna, OR with utm_medium matching Igna's campaigns (range)
  const mediums = (campaigns || []).map((c) => (c.medium || "").toLowerCase()).filter(Boolean);

  const { data: leadsDirecto } = await sb
    .from("leads")
    .select("id, nombre, instagram, email, fecha_agendado, fecha_llamada, estado, utm_source, utm_medium, setter_id")
    .eq("setter_id", igna.id)
    .or(`fecha_agendado.gte.${desde}T00:00:00,fecha_llamada.gte.${desde}T00:00:00`)
    .range(0, 4999);

  // Leads with utm_medium matching Igna's campaigns
  const { data: allLeads } = await sb
    .from("leads")
    .select("id, nombre, instagram, email, fecha_agendado, fecha_llamada, estado, utm_source, utm_medium, utm_content, setter_id")
    .range(0, 9999);

  const mediumsLower = new Set(mediums);
  const leadsViaUtm = (allLeads || []).filter((l) => {
    if (l.setter_id === igna.id) return false; // already counted in directo
    if (!l.utm_medium) return false;
    if (!mediumsLower.has(l.utm_medium.toLowerCase())) return false;
    const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
    return f >= desde && f <= hasta;
  });

  const leadsDirInRange = (leadsDirecto || []).filter((l) => {
    const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
    return f >= desde && f <= hasta;
  });

  // Recent iclosed_events in range
  const { data: events } = await sb
    .from("iclosed_events")
    .select("id, received_at, processed, process_error, payload")
    .gte("received_at", `${desde}T00:00:00`)
    .order("received_at", { ascending: false })
    .limit(200);

  const ignaEvents = (events || []).filter((e) => {
    const p = e.payload as Record<string, unknown> | null;
    const tracking = (p?.tracking as Record<string, unknown>) || {};
    const medium = String(tracking.utm_medium || "").toLowerCase();
    return mediumsLower.has(medium);
  });

  return NextResponse.json({
    igna: { id: igna.id, nombre: igna.nombre },
    rango: { desde, hasta },
    utm_campaigns_igna: campaigns || [],
    mediums_mapeados_a_igna: [...mediumsLower],
    leads_directos_con_setter_id_igna: leadsDirInRange.length,
    leads_via_utm_medium: leadsViaUtm.length,
    total: leadsDirInRange.length + leadsViaUtm.length,
    lista_directos: leadsDirInRange.map((l) => ({ nombre: l.nombre, fecha_ag: l.fecha_agendado?.split("T")[0], fecha_ll: l.fecha_llamada?.split("T")[0], estado: l.estado, utm_source: l.utm_source, utm_medium: l.utm_medium })),
    lista_via_utm: leadsViaUtm.map((l) => ({ nombre: l.nombre, fecha_ag: l.fecha_agendado?.split("T")[0], fecha_ll: l.fecha_llamada?.split("T")[0], estado: l.estado, utm_source: l.utm_source, utm_medium: l.utm_medium, utm_content: l.utm_content })),
    recent_iclosed_events_para_igna: ignaEvents.map((e) => {
      const p = e.payload as Record<string, unknown> | null;
      const tracking = (p?.tracking as Record<string, unknown>) || {};
      return {
        received_at: e.received_at,
        processed: e.processed,
        error: e.process_error,
        email: p?.email,
        nombre: [p?.firstName, p?.lastName].filter(Boolean).join(" "),
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_content: tracking.utm_content,
        status: p?.status,
      };
    }),
  });
}
