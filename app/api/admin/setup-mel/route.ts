import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sb = createServerClient();

  const { data: existing } = await sb.from("team_members").select("id,nombre,pin,is_cobranzas,is_seguimiento,is_admin").eq("nombre", "Mel").maybeSingle();
  if (existing) {
    await sb.from("team_members").update({ is_admin: true, is_cobranzas: true, is_seguimiento: true, rol: "admin", activo: true }).eq("id", existing.id);
    return NextResponse.json({ ok: true, action: "updated_admin", id: existing.id, pin: existing.pin });
  }

  // Find free pin
  const { data: pins } = await sb.from("team_members").select("pin");
  const used = new Set((pins || []).map((p) => p.pin).filter(Boolean));
  let pin = 1100;
  while (used.has(String(pin))) pin++;

  const { data, error } = await sb
    .from("team_members")
    .insert({
      nombre: "Mel",
      etiqueta: "mel",
      rol: "admin",
      is_admin: true,
      is_closer: false,
      is_setter: false,
      is_cobranzas: true,
      is_seguimiento: true,
      activo: true,
      pin: String(pin),
      comision_pct: 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: "created", id: data.id, pin });
}
