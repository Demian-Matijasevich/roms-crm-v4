import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "./supabase-server";
import type { AuthSession, TeamMember } from "./types";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "roms-crm-default-secret"
);
const COOKIE_NAME = "roms_session";

export async function createSessionToken(member: TeamMember): Promise<string> {
  const roles: string[] = [];
  if (member.is_admin) roles.push("admin");
  if (member.is_closer) roles.push("closer");
  if (member.is_setter) roles.push("setter");
  if (member.is_cobranzas) roles.push("cobranzas");
  if (member.is_seguimiento) roles.push("seguimiento");

  return new SignJWT({
    team_member_id: member.id,
    nombre: member.nombre,
    roles,
    is_admin: member.is_admin,
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

  return {
    token,
    session: {
      team_member_id: member.id,
      nombre: member.nombre,
      roles,
      is_admin: member.is_admin,
    },
  };
}

export { COOKIE_NAME };
