import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();

  const { count: dailyCount } = await sb.from("daily_reports").select("*", { count: "exact", head: true });
  const { data: recent } = await sb.from("daily_reports").select("*, setter:team_members!setter_id(nombre)").order("fecha", { ascending: false }).limit(10);
  const { data: setters } = await sb.from("team_members").select("id, nombre, is_setter, activo").eq("is_setter", true);

  return NextResponse.json({
    daily_reports_count: dailyCount,
    recent_reports: recent,
    setters,
  });
}
