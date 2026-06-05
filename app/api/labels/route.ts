/**
 * GET  /api/labels        — lista labels (filtrar opcional ?scope=politica|general|all).
 * POST /api/labels        — crea un label (solo admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const scope = req.nextUrl.searchParams.get("scope");
  const sb = createServerClient();
  let q = sb.from("lead_labels").select("id, nombre, color, scope, created_at").order("nombre");
  if (scope && scope !== "all") {
    // Si piden un scope específico, devolvemos los de ese scope + los 'all'
    q = q.in("scope", [scope, "all"]);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ labels: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre || "").trim();
  const color = String(body.color || "#3b82f6");
  const scope = String(body.scope || "all");
  if (!nombre) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
  if (!["all", "politica", "general"].includes(scope)) {
    return NextResponse.json({ error: "scope inválido" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from("lead_labels")
    .insert({ nombre, color, scope })
    .select("id, nombre, color, scope, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ label: data });
}
