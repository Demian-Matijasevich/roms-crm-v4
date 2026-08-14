import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Fail-closed: en prod, si falta JWT_SECRET, NO usar un default público.
// Esto es idéntico al chequeo de lib/auth.ts para que middleware y handlers
// nunca acepten tokens firmados con un secret conocido.
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 16)) {
  throw new Error("[middleware] JWT_SECRET no configurado o demasiado corto en producción");
}
const SECRET = new TextEncoder().encode(JWT_SECRET_RAW || "dev-only-do-not-use-in-prod");

// Hostnames del subdominio de política. Si en algún ambiente cambia,
// agregar a la lista (o usar env POLITICA_HOSTS).
const POLITICA_HOSTS = new Set([
  "politica.crm.backstagge.com",
  "politica.backstagge.com",
  ...(process.env.POLITICA_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean),
]);

// Solo estos team_members pueden entrar al subdominio política.
const POLITICA_ALLOWED_NOMBRES = ["Juanma", "Mati", "Fran", "Seba", "Nacho", "Nicolás"];

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("roms_session")?.value;
  const host = req.headers.get("host") || "";
  const isPolitica = POLITICA_HOSTS.has(host);

  // Allow login page, API routes y design-lab (preview público)
  if (
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/api/") ||
    req.nextUrl.pathname.startsWith("/design-lab")
  ) {
    // Inyectar header X-Vista para que las server actions/queries lo lean
    if (isPolitica) {
      const res = NextResponse.next();
      res.headers.set("x-roms-vista", "politica");
      return res;
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Restricción de subdominio política: solo nombres autorizados
    if (isPolitica) {
      const nombre = String(payload.nombre || "");
      if (!POLITICA_ALLOWED_NOMBRES.includes(nombre)) {
        // Acceso denegado: forzar logout
        const res = NextResponse.redirect(new URL("/login?denied=politica", req.url));
        res.cookies.delete("roms_session");
        return res;
      }
      const res = NextResponse.next();
      res.headers.set("x-roms-vista", "politica");
      // Forzar la cookie de vista=politica para que TODAS las queries filtren
      if (req.cookies.get("roms_vista")?.value !== "politica") {
        res.cookies.set("roms_vista", "politica", {
          // Solo la lee el server (lib/vista.ts via next/headers cookies()),
          // no hay JS de cliente que la toque. httpOnly evita XSS reads.
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        });
      }
      return res;
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
