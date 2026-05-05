import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const sb = createServerClient();
  const [catRes, cajaRes] = await Promise.all([
    sb.from("gastos_categorias").select("nombre, orden, activo").eq("activo", true).order("orden"),
    sb.from("gastos_cajas").select("nombre, moneda, orden, activo").eq("activo", true).order("orden"),
  ]);
  return NextResponse.json({
    ok: true,
    categorias: catRes.data ?? [],
    cajas: cajaRes.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  if (!auth.session.is_admin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const body = await req.json();
  const { tipo, nombre, moneda, orden } = body;
  if (!tipo || !nombre) return NextResponse.json({ error: "tipo y nombre requeridos" }, { status: 400 });
  const sb = createServerClient();
  if (tipo === "categoria") {
    const { error } = await sb.from("gastos_categorias").insert({ nombre, orden: orden ?? 0 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (tipo === "caja") {
    const { error } = await sb.from("gastos_cajas").insert({ nombre, moneda: moneda || "usd", orden: orden ?? 0 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  if (!auth.session.is_admin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo");
  const nombre = url.searchParams.get("nombre");
  if (!tipo || !nombre) return NextResponse.json({ error: "tipo y nombre requeridos" }, { status: 400 });

  const sb = createServerClient();
  const table = tipo === "categoria" ? "gastos_categorias" : tipo === "caja" ? "gastos_cajas" : null;
  if (!table) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  // Soft-delete: marcar inactivo
  const { error } = await sb.from(table).update({ activo: false }).eq("nombre", nombre);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
