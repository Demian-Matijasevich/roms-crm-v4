/**
 * GET /api/auth/google-calendar/callback?code=...&state=...
 *
 * Recibe el code de Google, lo intercambia por tokens y los guarda en
 * closer_calendar_tokens. Redirige a /conectar-calendar?connected=1.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface TokenResp {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface IdTokenClaims {
  email?: string;
  sub?: string;
}

function decodeIdToken(idToken: string): IdTokenClaims {
  try {
    const payload = idToken.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf-8");
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const stateRaw = url.searchParams.get("state");

  if (error) {
    return NextResponse.redirect(new URL(`/conectar-calendar?error=${error}`, req.url));
  }
  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL("/conectar-calendar?error=missing_params", req.url));
  }

  let stateData: { tmid: string; nonce: string };
  try {
    stateData = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
  } catch {
    return NextResponse.redirect(new URL("/conectar-calendar?error=bad_state", req.url));
  }
  if (stateData.tmid !== auth.session.team_member_id) {
    return NextResponse.redirect(new URL("/conectar-calendar?error=state_mismatch", req.url));
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL("/conectar-calendar?error=server_config", req.url));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokenJson = (await tokenRes.json()) as TokenResp;

  if (!tokenRes.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
    return NextResponse.redirect(
      new URL(
        `/conectar-calendar?error=${encodeURIComponent(tokenJson.error || "token_exchange_failed")}`,
        req.url
      )
    );
  }

  const claims = tokenJson.id_token ? decodeIdToken(tokenJson.id_token) : {};
  const googleEmail = claims.email || "unknown";
  const expiresIn = tokenJson.expires_in || 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

  const sb = createServerClient();
  const { error: dbError } = await sb.from("closer_calendar_tokens").upsert(
    {
      team_member_id: auth.session.team_member_id,
      google_email: googleEmail,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      token_expiry: tokenExpiry,
      scope: tokenJson.scope || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_member_id" }
  );

  if (dbError) {
    return NextResponse.redirect(
      new URL(`/conectar-calendar?error=${encodeURIComponent(dbError.message)}`, req.url)
    );
  }

  return NextResponse.redirect(
    new URL(`/conectar-calendar?connected=${encodeURIComponent(googleEmail)}`, req.url)
  );
}
