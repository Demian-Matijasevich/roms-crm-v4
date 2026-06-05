/**
 * GET /api/leads/[id]/activity — feed de actividad del lead (orden desc, paginado).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || "50");
  const offsetRaw = Number(req.nextUrl.searchParams.get("offset") || "0");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_activity")
    .select("id, lead_id, actor_id, actor_nombre, tipo, mensaje, meta, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data || [] });
}
