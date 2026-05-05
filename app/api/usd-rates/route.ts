import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET → lista de rates por mes
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const sb = createServerClient();
  const { data, error } = await sb.from("usd_rate_history").select("*").order("mes", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rates: data ?? [] });
}

// PUT → upsert un rate para un mes específico
export async function PUT(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  if (!auth.session.is_admin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const body = await req.json();
  const { mes, rate } = body;
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "mes debe ser YYYY-MM" }, { status: 400 });
  }
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) {
    return NextResponse.json({ error: "rate debe ser > 0" }, { status: 400 });
  }
  const sb = createServerClient();
  const { error } = await sb
    .from("usd_rate_history")
    .upsert({ mes, rate: r, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mes, rate: r });
}

// DELETE → borrar el rate de un mes
export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  if (!auth.session.is_admin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const url = new URL(req.url);
  const mes = url.searchParams.get("mes");
  if (!mes) return NextResponse.json({ error: "mes requerido" }, { status: 400 });
  const sb = createServerClient();
  const { error } = await sb.from("usd_rate_history").delete().eq("mes", mes);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
