import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

/** Find payments by amount + optional closer. ?s=X&monto=10000&closer=Valentino */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const monto = Number(url.searchParams.get("monto") || 0);
  const closerSearch = (url.searchParams.get("closer") || "").toLowerCase();

  const sb = createServerClient();
  const { data: payments } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor")
    .gte("monto_usd", monto - 50)
    .lte("monto_usd", monto + 50)
    .order("fecha_pago", { ascending: false });

  const ids = [...new Set((payments || []).map((p) => p.lead_id).filter(Boolean) as string[])];
  const { data: leads } = ids.length > 0
    ? await sb.from("leads").select("id, nombre, programa_pitcheado, closer_id, setter_id").in("id", ids)
    : { data: [] };
  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre]));
  const leadById = new Map((leads || []).map((l) => [l.id, l]));

  const out = (payments || []).map((p) => {
    const lead = p.lead_id ? leadById.get(p.lead_id) : null;
    const closerName = lead?.closer_id ? teamById.get(lead.closer_id) || null : null;
    return {
      payment_id: p.id,
      fecha: p.fecha_pago,
      monto: p.monto_usd,
      estado: p.estado,
      cuota: p.numero_cuota,
      receptor: p.receptor,
      lead_id: p.lead_id,
      lead_nombre: lead?.nombre || "(sin lead)",
      programa: lead?.programa_pitcheado || null,
      closer: closerName,
    };
  }).filter((p) => !closerSearch || (p.closer || "").toLowerCase().includes(closerSearch));

  return NextResponse.json({ ok: true, count: out.length, payments: out });
}
