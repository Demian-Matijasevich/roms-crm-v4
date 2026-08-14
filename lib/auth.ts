import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "./supabase-server";
import type { AuthSession, TeamMember } from "./types";

// JWT_SECRET es obligatorio en prod. Si falta, tiramos error explícito
// en lugar de usar un fallback inseguro que permitiría forjar tokens admin.
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 16)) {
  throw new Error("[auth] JWT_SECRET no configurado o demasiado corto en producción");
}
const SECRET = new TextEncoder().encode(JWT_SECRET_RAW || "dev-only-do-not-use-in-prod");
const COOKIE_NAME = "roms_session";

export async function createSessionToken(member: TeamMember): Promise<string> {
  const roles: string[] = [];
  if (member.is_admin) roles.push("admin");
  if (member.is_closer) roles.push("closer");
  if (member.is_setter) roles.push("setter");
  if (member.is_cobranzas) roles.push("cobranzas");
  if (member.is_seguimiento) roles.push("seguimiento");
  if (member.is_jefe_ventas) roles.push("jefe_ventas");

  return new SignJWT({
    team_member_id: member.id,
    nombre: member.nombre,
    roles,
    is_admin: member.is_admin,
    is_jefe_ventas: !!member.is_jefe_ventas,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AuthSession;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(): Promise<
  { session: AuthSession } | { error: NextResponse }
> {
  const result = await requireSession();
  if ("error" in result) return result;
  if (!result.session.is_admin) {
    return { error: NextResponse.json({ error: "Solo admins" }, { status: 403 }) };
  }
  return result;
}

/**
 * Auth para endpoints admin invocables desde scripts.
 * 1) Si hay sesión admin válida → OK
 * 2) Si no, valida header `x-admin-secret` contra ADMIN_API_SECRET
 *
 * NO acepta el secret por query param (?s=): el query queda en logs de
 * proxies, referer y history del browser. Los scripts que hoy manden ?s=
 * fallarán con 401 y hay que actualizarlos para mandar el header.
 * Nunca acepta secret vacío (fail-closed).
 */
export async function requireAdminOrSecret(
  req: Request
): Promise<{ ok: true } | { error: NextResponse }> {
  const admin = await requireAdmin();
  if (!("error" in admin)) return { ok: true };

  const expected = (process.env.ADMIN_API_SECRET || "").trim();
  if (!expected) {
    return { error: NextResponse.json({ error: "ADMIN_API_SECRET no configurado" }, { status: 500 }) };
  }
  const provided = (req.headers.get("x-admin-secret") || "").trim();
  if (provided && provided === expected) return { ok: true };
  return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
}

export async function loginWithPin(
  nombre: string,
  pin: string
): Promise<{ token: string; session: AuthSession } | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("team_members")
    .select("*")
    .eq("nombre", nombre)
    .eq("pin", pin)
    .eq("activo", true)
    .single();

  if (!data) return null;

  const member = data as TeamMember;
  const token = await createSessionToken(member);

  const roles: string[] = [];
  if (member.is_admin) roles.push("admin");
  if (member.is_closer) roles.push("closer");
  if (member.is_setter) roles.push("setter");
  if (member.is_cobranzas) roles.push("cobranzas");
  if (member.is_seguimiento) roles.push("seguimiento");
  if (member.is_jefe_ventas) roles.push("jefe_ventas");

  return {
    token,
    session: {
      team_member_id: member.id,
      nombre: member.nombre,
      roles,
      is_admin: member.is_admin,
      is_jefe_ventas: !!member.is_jefe_ventas,
    },
  };
}

export { COOKIE_NAME };
