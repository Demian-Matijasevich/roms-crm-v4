import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const desde = url.searchParams.get("desde") || "2026-04-01";
  const hasta = url.searchParams.get("hasta") || "2026-04-30";

  const sb = createServerClient();

  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, closer_id, fecha_llamada, fecha_agendado, ticket_total, sheets_row_index")
    .gte("fecha_llamada", `${desde}T00:00:00`)
    .lte("fecha_llamada", `${hasta}T23:59:59`)
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .order("fecha_llamada");

  const { data: team } = await sb.from("team_members").select("id, nombre");
  const teamById = new Map((team || []).map((t) => [t.id, t.nombre] as const));

  const byCloser: Record<string, { count: number; total_ticket: number; leads: Array<{ nombre: string; estado: string; fecha: string | null; ticket: number; sheet_row: number | null }> }> = {};
  const sinCloser: Array<{ nombre: string; estado: string; fecha: string | null; ticket: number; sheet_row: number | null }> = [];

  for (const l of leads || []) {
    const entry = {
      nombre: l.nombre,
      estado: l.estado,
      fecha: l.fecha_llamada,
      ticket: l.ticket_total || 0,
      sheet_row: l.sheets_row_index,
    };
    if (!l.closer_id) {
      sinCloser.push(entry);
      continue;
    }
    const name = teamById.get(l.closer_id) || "¿?";
    if (!byCloser[name]) byCloser[name] = { count: 0, total_ticket: 0, leads: [] };
    byCloser[name].count++;
    byCloser[name].total_ticket += l.ticket_total || 0;
    byCloser[name].leads.push(entry);
  }

  return NextResponse.json({
    rango: { desde, hasta },
    total_cerradas: leads?.length || 0,
    sin_closer_asignado: sinCloser,
    by_closer: byCloser,
  });
}
