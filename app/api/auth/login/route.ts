import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { loginWithPin, COOKIE_NAME } from "@/lib/auth";

// Rate-limit muy simple en memoria por (IP+nombre). Suficiente para el volumen
// actual de logins. En multi-instancia se reseta por instance — para ese caso
// migrar a Upstash/Redis.
type Attempt = { count: number; firstAt: number; lockedUntil: number };
const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;       // 5 min para acumular
const LOCKOUT_MS = 15 * 60 * 1000;     // 15 min bloqueado tras MAX_ATTEMPTS

function getClientKey(req: NextRequest, nombre: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";
  return `${ip}::${nombre.toLowerCase().trim()}`;
}

function isLocked(key: string): { locked: boolean; retryMs?: number } {
  const a = attempts.get(key);
  if (!a) return { locked: false };
  const now = Date.now();
  if (a.lockedUntil > now) return { locked: true, retryMs: a.lockedUntil - now };
  if (now - a.firstAt > WINDOW_MS) attempts.delete(key);
  return { locked: false };
}

function recordFail(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = now + LOCKOUT_MS;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "PIN inválido" }, { status: 400 });
    }

    const key = getClientKey(req, parsed.data.nombre);
    const lock = isLocked(key);
    if (lock.locked) {
      const mins = Math.ceil((lock.retryMs || 0) / 60000);
      return NextResponse.json(
        { error: `Demasiados intentos. Probá en ${mins} min.` },
        { status: 429 }
      );
    }

    const result = await loginWithPin(parsed.data.nombre, parsed.data.pin);
    if (!result) {
      recordFail(key);
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }
    // login ok → reset contador
    attempts.delete(key);

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
