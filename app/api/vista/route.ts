import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { VISTA_COOKIE } from "@/lib/vista";

/**
 * POST /api/vista — cambia la vista del CRM (todos / general / politica).
 * Solo admin.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const vista = body?.vista;
    if (!["todos", "general", "politica"].includes(vista)) {
      return NextResponse.json({ error: "vista invalida" }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true, vista });
    res.cookies.set(VISTA_COOKIE, vista, {
      httpOnly: false, // Para que el cliente la pueda leer si quiere
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 dias
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[POST /api/vista]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
