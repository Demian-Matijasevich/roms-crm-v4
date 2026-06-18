/**
 * GET /api/calendar/events?team_member_id=X&from=ISO&to=ISO&token=CRON_TOKEN
 *
 * Devuelve eventos del calendar primario del closer entre [from, to].
 * Usado por el cron de n8n que cruza GCal vs leads para detectar agendas
 * externas (no-iClosed).
 *
 * Protegido por CRON_TOKEN (env). Si el access_token está vencido, refresca
 * con el refresh_token y persiste el nuevo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface RefreshResp {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
}

interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  attendees?: Array<{ email?: string; responseStatus?: string; displayName?: string }>;
  organizer?: { email?: string };
  hangoutLink?: string;
  htmlLink?: string;
  iCalUID?: string;
}

interface GCalList {
  items?: GCalEvent[];
  nextPageToken?: string;
  error?: { message?: string };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const json = (await res.json()) as RefreshResp;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || `refresh_failed_${res.status}`);
  }
  return {
    access_token: json.access_token,
    expires_in: json.expires_in || 3600,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cronToken = url.searchParams.get("token") || "";
  const expectedToken = process.env.EOD_CRON_TOKEN || "";
  if (!expectedToken || cronToken !== expectedToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const teamMemberId = url.searchParams.get("team_member_id");
  if (!teamMemberId) {
    return NextResponse.json({ error: "team_member_id requerido" }, { status: 400 });
  }
  const from = url.searchParams.get("from") || new Date(Date.now() - 7 * 86400_000).toISOString();
  const to = url.searchParams.get("to") || new Date(Date.now() + 30 * 86400_000).toISOString();

  const sb = createServerClient();
  const { data: token } = await sb
    .from("closer_calendar_tokens")
    .select("*")
    .eq("team_member_id", teamMemberId)
    .maybeSingle();

  if (!token) {
    return NextResponse.json({ error: "closer no conectó su calendar" }, { status: 404 });
  }

  let accessToken: string = token.access_token;
  const expiry = new Date(token.token_expiry).getTime();
  // Refresh si vence en <60s
  if (expiry - Date.now() < 60_000) {
    try {
      const refreshed = await refreshAccessToken(token.refresh_token);
      accessToken = refreshed.access_token;
      await sb
        .from("closer_calendar_tokens")
        .update({
          access_token: refreshed.access_token,
          token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("team_member_id", teamMemberId);
    } catch (e) {
      await sb
        .from("closer_calendar_tokens")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_ok: false,
          last_sync_msg: `refresh_failed: ${(e as Error).message}`,
        })
        .eq("team_member_id", teamMemberId);
      return NextResponse.json({ error: "refresh_failed" }, { status: 500 });
    }
  }

  // Paginá hasta agotar (max 5 páginas como guard).
  const events: GCalEvent[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 5; i++) {
    const apiUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    apiUrl.searchParams.set("timeMin", from);
    apiUrl.searchParams.set("timeMax", to);
    apiUrl.searchParams.set("singleEvents", "true");
    apiUrl.searchParams.set("orderBy", "startTime");
    apiUrl.searchParams.set("maxResults", "250");
    if (pageToken) apiUrl.searchParams.set("pageToken", pageToken);
    const gres = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const gjson = (await gres.json()) as GCalList;
    if (!gres.ok) {
      await sb
        .from("closer_calendar_tokens")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_ok: false,
          last_sync_msg: `gcal_error: ${gjson.error?.message || gres.status}`,
        })
        .eq("team_member_id", teamMemberId);
      return NextResponse.json({ error: gjson.error?.message || "gcal_error" }, { status: 502 });
    }
    if (gjson.items) events.push(...gjson.items);
    if (!gjson.nextPageToken) break;
    pageToken = gjson.nextPageToken;
  }

  await sb
    .from("closer_calendar_tokens")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_ok: true,
      last_sync_msg: `ok ${events.length} events`,
    })
    .eq("team_member_id", teamMemberId);

  return NextResponse.json({
    team_member_id: teamMemberId,
    google_email: token.google_email,
    from,
    to,
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      ical_uid: e.iCalUID,
      summary: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      status: e.status,
      attendees:
        e.attendees?.map((a) => ({
          email: a.email,
          name: a.displayName,
          response: a.responseStatus,
        })) || [],
      hangout: e.hangoutLink,
      html_link: e.htmlLink,
    })),
  });
}
