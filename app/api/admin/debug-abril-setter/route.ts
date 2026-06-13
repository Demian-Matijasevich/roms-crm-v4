import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, setter_id, utm_source, utm_medium, fecha_agendado, fecha_llamada, estado, sheets_row_index")
    .or("fecha_agendado.gte.2026-04-01T00:00:00,fecha_llamada.gte.2026-04-01T00:00:00")
    .range(0, 4999);

  const inAbril = (leads || []).filter((l) => {
    const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
    return f >= "2026-04-01" && f <= "2026-04-30";
  });

  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns || []) {
    if (c.setter_id && c.medium) mediumToSetter.set(String(c.medium).toLowerCase(), c.setter_id);
  }

  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre] as const));

  const bySetter: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byMedium: Record<string, number> = {};
  let withSetter = 0, sinSetter = 0, viaUtm = 0;
  const sample: Array<{ nombre: string; utm_source: string | null; utm_medium: string | null; fecha: string | null; estado: string; row: number | null }> = [];

  for (const l of inAbril) {
    let setterName: string | null = null;
    if (l.setter_id) {
      withSetter++;
      setterName = teamById.get(l.setter_id) || "?";
    } else if (l.utm_medium && mediumToSetter.has(l.utm_medium.toLowerCase())) {
      viaUtm++;
      const sid = mediumToSetter.get(l.utm_medium.toLowerCase())!;
      setterName = teamById.get(sid) || "?";
    } else {
      sinSetter++;
      if (sample.length < 20) sample.push({
        nombre: l.nombre,
        utm_source: l.utm_source,
        utm_medium: l.utm_medium,
        fecha: (l.fecha_agendado || l.fecha_llamada || "").split("T")[0],
        estado: l.estado,
        row: l.sheets_row_index,
      });
    }
    if (setterName) bySetter[setterName] = (bySetter[setterName] || 0) + 1;
    const src = (l.utm_source || "sin_utm").toLowerCase().trim();
    bySource[src] = (bySource[src] || 0) + 1;
    const med = (l.utm_medium || "sin_medium").toLowerCase().trim();
    byMedium[med] = (byMedium[med] || 0) + 1;
  }

  return NextResponse.json({
    total_abril: inAbril.length,
    con_setter_directo: withSetter,
    via_utm_campaign: viaUtm,
    sin_setter: sinSetter,
    breakdown_setter: bySetter,
    breakdown_utm_source_abril: bySource,
    breakdown_utm_medium_abril: byMedium,
    sample_sin_setter: sample,
  });
}
