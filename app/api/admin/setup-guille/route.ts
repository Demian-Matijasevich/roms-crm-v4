import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = createServerClient();

  const { data: existing } = await sb.from("team_members").select("id,nombre,pin").ilike("nombre", "guille").maybeSingle();
  let guilleId: string;
  if (existing) {
    guilleId = existing.id;
    await sb.from("team_members").update({ is_setter: true, activo: true }).eq("id", existing.id);
  } else {
    const { data: pins } = await sb.from("team_members").select("pin");
    const used = new Set((pins || []).map((p) => p.pin).filter(Boolean));
    let pin = 1004;
    while (used.has(String(pin))) pin++;
    const { data, error } = await sb.from("team_members").insert({
      nombre: "Guille",
      etiqueta: "guille",
      rol: "setter",
      is_admin: false,
      is_closer: false,
      is_setter: true,
      activo: true,
      pin: String(pin),
      comision_pct: 3,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    guilleId = data.id;
  }

  // Upsert UTM campaigns for guille
  const campaigns = [
    { url: "https://app.iclosed.io/e/romsconsultora/s-llamada-de-consultoria-i-roms-consultora?utm_source=inbound&utm_medium=guille&utm_content=guille", source: "inbound", medium: "guille", content: "guille" },
    { url: "https://app.iclosed.io/e/romsconsultora/ot-llamada-de-consultoria-i-roms-consultora?utm_source=outbound&utm_medium=guille&utm_content=guille", source: "outbound", medium: "guille", content: "guille" },
  ];
  let created = 0;
  for (const c of campaigns) {
    const { data: ex } = await sb.from("utm_campaigns").select("id").eq("medium", c.medium).eq("source", c.source).maybeSingle();
    if (!ex) {
      await sb.from("utm_campaigns").insert({ ...c, setter_id: guilleId });
      created++;
    } else {
      await sb.from("utm_campaigns").update({ setter_id: guilleId }).eq("id", ex.id);
    }
  }

  // Backfill: any lead with utm_medium=guille (or GUILLE) and no setter → assign Guille
  const { data: leads } = await sb.from("leads").select("id, utm_medium, setter_id").ilike("utm_medium", "guille");
  const toUpdate = (leads || []).filter((l) => !l.setter_id);
  for (const l of toUpdate) {
    await sb.from("leads").update({ setter_id: guilleId }).eq("id", l.id);
  }

  return NextResponse.json({ ok: true, guille_id: guilleId, campaigns_created: created, backfilled_leads: toUpdate.length });
}
