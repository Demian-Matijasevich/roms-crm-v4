/**
 * GET /api/auth/google-calendar/start
 *
 * Genera URL de consent de Google y redirige al closer.
 * Solo accesible si está logueado. El callback guarda los tokens contra
 * su team_member_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "openid",
  "email",
].join(" ");

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Google Calendar OAuth no configurado en env" },
      { status: 500 }
    );
  }

  // state: encodear team_member_id + nonce simple (no es token, solo CSRF guard).
  const nonce = Math.random().toString(36).slice(2, 12);
  const state = Buffer.from(
    JSON.stringify({ tmid: auth.session.team_member_id, nonce })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // forzar refresh_token siempre
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(url);
}
