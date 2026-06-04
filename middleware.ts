import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "roms-crm-default-secret"
);

// Hostnames del subdominio de política. Si en algún ambiente cambia,
// agregar a la lista (o usar env POLITICA_HOSTS).
const POLITICA_HOSTS = new Set([
  "politica.crm.backstagge.com",
  "politica.backstagge.com",
  ...(process.env.POLITICA_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean),
]);

// Solo estos team_members pueden entrar al subdominio política.
const POLITICA_ALLOWED_NOMBRES = ["Juanma", "Mati", "Fran", "Seba", "Nacho"];

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
          httpOnly: false,
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
