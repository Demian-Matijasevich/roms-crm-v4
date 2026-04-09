import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { loginWithPin, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "PIN inválido" }, { status: 400 });
    }

    const result = await loginWithPin(parsed.data.nombre, parsed.data.pin);
    if (!result) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, session: result.session });
    response.cookies.set(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
