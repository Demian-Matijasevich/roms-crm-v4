/**
 * GET /api/cron/calendar-sync?token=XXX&date=YYYY-MM-DD
 *
 * Calendar Tracker — corre antes del EOD para sincronizar el CRM con los
 * Google Calendars de cada closer conectado.
 *
 * Por cada closer con token vivo:
 *   1. Lee eventos de su calendar del día (ART).
 *   2. Filtra llamadas reales (descarta personales/internas).
 *   3. Para cada llamada:
 *      - Si matchea un lead existente del closer (por email o nombre): si su
 *        fecha_llamada NO es del día, la actualiza (calendar=verdad).
 *      - Si NO matchea: crea lead nuevo con etiqueta "externa".
 *
 * Protegido por EOD_CRON_TOKEN (misma key que el EOD).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface CalendarEvent {
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; responseStatus?: string }>;
}

interface TokenRow {
  team_member_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
}

interface LeadRow {
  id: string;
  nombre: string | null;
  email: string | null;
  fecha_llamada: string | null;
}

const TEAM_HINTS = [
  "agustin.olivero",
  "coriamati",
  "melaniedaiana",
  "valentinogranata",
  "juanmartinblancoo",
  "backstagge",
  "salesolution",
  "ignacioclaveria",
  "ignaciorust",
  "lanzavecch",
];

const PERSONAL_HINTS = [
  "gym",
  "cardio",
  "abs",
  "read",
  "futbol",
  "fútbol",
  "bloq",
  "checkout",
  "fup ",
  "ducha",
  "yoga",
  "check",
  "roms daily",
];

async function refreshAccessToken(refreshToken: string): Promise<string> {
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
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error || "refresh_failed");
  return j.access_token;
}

async function fetchEvents(access: string, fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const j = (await r.json()) as { items?: CalendarEvent[]; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message || `gcal ${r.status}`);
  return j.items || [];
}

function isCallEvent(ev: CalendarEvent): boolean {
  const s = (ev.summary || "").toLowerCase().trim();
  if (!s) return false;
  if (ev.status === "cancelled" && s.startsWith("canceled")) return false;
  for (const k of PERSONAL_HINTS) {
    if (s.includes(k)) return false;
  }
  return true;
}

function extractExternalEmails(ev: CalendarEvent): string[] {
  return (ev.attendees || [])
    .map((a) => (a.email || "").toLowerCase())
    .filter((e) => e && !TEAM_HINTS.some((t) => e.includes(t)));
}

function extractNombreDelSummary(summary: string, hora: string): string {
  let nm = summary
    .split("×")[0]
    .split(" x ")[0]
    .split(" X ")[0]
    .split(" and ")[0]
    .split(" y ")[0]
    .split(":")[0]
    .trim();
  if (/^llamada con /i.test(nm)) {
    nm = nm.replace(/^llamada con /i, "").trim();
  }
  if (!nm || nm === "Llamada" || nm === ".") return `Sin nombre - ${hora}`;
  return nm;
}

interface SyncStats {
  closer_id: string;
  google_email: string;
  events_calendar: number;
  calls_real: number;
  matched_already_ok: number;
  fechas_actualizadas: number;
  externas_creadas: number;
  errors: string[];
}

async function syncOneCloser(
  sb: SupabaseClient,
  token: TokenRow,
  dayStartUtc: Date,
  dayEndUtc: Date
): Promise<SyncStats> {
  const stats: SyncStats = {
    closer_id: token.team_member_id,
    google_email: token.google_email,
    events_calendar: 0,
    calls_real: 0,
    matched_already_ok: 0,
    fechas_actualizadas: 0,
    externas_creadas: 0,
    errors: [],
  };

  let access: string;
  try {
    access = await refreshAccessToken(token.refresh_token);
    await sb
      .from("closer_calendar_tokens")
      .update({
        access_token: access,
        token_expiry: new Date(Date.now() + 3500 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("team_member_id", token.team_member_id);
  } catch (e) {
    stats.errors.push(`refresh_failed: ${(e as Error).message}`);
    return stats;
  }

  let events: CalendarEvent[];
  try {
    events = await fetchEvents(access, dayStartUtc.toISOString(), dayEndUtc.toISOString());
  } catch (e) {
    stats.errors.push(`fetch_events: ${(e as Error).message}`);
    return stats;
  }
  stats.events_calendar = events.length;

  const realCalls = events.filter(isCallEvent);
  stats.calls_real = realCalls.length;

  const { data: leadsCloser } = await sb
    .from("leads")
    .select("id,nombre,email,fecha_llamada")
    .eq("closer_id", token.team_member_id);
  const leadsCloserList = (leadsCloser || []) as LeadRow[];

  const byEmail = new Map<string, LeadRow>();
  for (const l of leadsCloserList) {
    if (l.email) byEmail.set(l.email.toLowerCase(), l);
  }

  for (const ev of realCalls) {
    const startStr = ev.start?.dateTime || ev.start?.date || "";
    if (!startStr.includes("T")) continue;
    const startDate = new Date(startStr);
    if (isNaN(startDate.getTime())) continue;
    if (startDate < dayStartUtc || startDate >= dayEndUtc) continue;

    const summary = (ev.summary || "(sin título)").trim();
    const ext = extractExternalEmails(ev);

    let match: LeadRow | null = null;
    for (const em of ext) {
      const found = byEmail.get(em);
      if (found) {
        match = found;
        break;
      }
    }
    if (!match) {
      const sLower = summary.toLowerCase();
      for (const l of leadsCloserList) {
        const ln = (l.nombre || "").toLowerCase().trim();
        if (ln && ln.length > 3 && sLower.includes(ln)) {
          match = l;
          break;
        }
      }
    }

    if (match) {
      const hasDayDate =
        match.fecha_llamada &&
        new Date(match.fecha_llamada) >= dayStartUtc &&
        new Date(match.fecha_llamada) < dayEndUtc;
      if (hasDayDate) {
        stats.matched_already_ok++;
      } else {
        const { error } = await sb
          .from("leads")
          .update({ fecha_llamada: startDate.toISOString() })
          .eq("id", match.id);
        if (error) stats.errors.push(`update ${match.id}: ${error.message}`);
        else stats.fechas_actualizadas++;
      }
    } else {
      const horaArt = new Date(startDate.getTime() - 3 * 3600 * 1000)
        .toISOString()
        .slice(11, 16);
      const nombre = extractNombreDelSummary(summary, horaArt);
      const newLead: Record<string, unknown> = {
        nombre,
        closer_id: token.team_member_id,
        estado: "pendiente",
        fecha_llamada: startDate.toISOString(),
        fuente: "otro",
        nicho: "general",
        notas_internas: `Calendar Tracker — cargado automáticamente desde calendar de ${token.google_email}`,
        etiquetas: ["externa"],
      };
      if (ext.length > 0) newLead.email = ext[0];
      const { error } = await sb.from("leads").insert(newLead);
      if (error) stats.errors.push(`insert ${nombre}: ${error.message}`);
      else stats.externas_creadas++;
    }
  }

  return stats;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const expected = process.env.EOD_CRON_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Día por defecto = HOY en ART
  const dateParam = url.searchParams.get("date"); // YYYY-MM-DD
  const baseDate = dateParam
    ? new Date(`${dateParam}T00:00:00-03:00`)
    : new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const yyyy = baseDate.getFullYear();
  const mm = baseDate.getMonth();
  const dd = baseDate.getDate();
  const dayStartUtc = new Date(Date.UTC(yyyy, mm, dd, 3, 0, 0));
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);

  const sb = createServerClient();
  const { data: tokens, error } = await sb
    .from("closer_calendar_tokens")
    .select("team_member_id,google_email,access_token,refresh_token,token_expiry");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allStats: SyncStats[] = [];
  for (const t of (tokens || []) as TokenRow[]) {
    try {
      const s = await syncOneCloser(sb, t, dayStartUtc, dayEndUtc);
      allStats.push(s);
    } catch (e) {
      allStats.push({
        closer_id: t.team_member_id,
        google_email: t.google_email,
        events_calendar: 0,
        calls_real: 0,
        matched_already_ok: 0,
        fechas_actualizadas: 0,
        externas_creadas: 0,
        errors: [(e as Error).message],
      });
    }
  }

  return NextResponse.json({
    date: dateParam || `${yyyy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
    closers_sincronizados: allStats.length,
    total_fechas_actualizadas: allStats.reduce((a, s) => a + s.fechas_actualizadas, 0),
    total_externas_creadas: allStats.reduce((a, s) => a + s.externas_creadas, 0),
    per_closer: allStats,
  });
}
