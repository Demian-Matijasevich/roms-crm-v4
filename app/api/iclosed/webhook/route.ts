import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSetting } from "@/lib/queries/settings";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

interface IClosedPayload {
  id?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  status?: string;
  createdAt?: string;
  previewId?: string;
  country?: string;
  questionsAndAnswers?: Record<string, string>;
  tracking?: {
    utm_source?: string;
    utm_medium?: string;
    utm_content?: string;
    utm_campaign?: string;
  };
  latestCall?: {
    id?: number;
    dateTime?: string;
    duration?: number;
    user?: { id?: number; firstName?: string; lastName?: string; email?: string };
  };
  event?: { id?: number; name?: string; eventType?: string };
  hookType?: string;
}

function mapStatus(iclosedStatus: string): string {
  const s = (iclosedStatus || "").toUpperCase();
  if (s === "STRATEGY_CALL_BOOKED" || s === "DISCOVERY_CALL_BOOKED") return "pendiente";
  if (s === "QUALIFIED") return "pendiente";
  if (s === "DISQUALIFIED") return "no_calificado";
  return "pendiente";
}

function extractInstagram(qa: Record<string, string> | undefined): string | null {
  if (!qa) return null;
  for (const [k, v] of Object.entries(qa)) {
    if (k.endsWith("_question") || k.endsWith("_response")) continue;
    if (k.toLowerCase().includes("instagram") && v) return v.replace(/^@/, "").trim();
  }
  return null;
}

async function processEvent(payload: IClosedPayload) {
  if (!payload.email) return { skipped: "no email" };
  const sb = createServerClient();

  const { data: existing } = await sb
    .from("leads")
    .select("id, estado, notas_internas")
    .eq("email", payload.email)
    .limit(1);
  const lead = existing?.[0];

  // Setter from utm_medium via utm_campaigns
  let setter_id: string | null = null;
  const medium = payload.tracking?.utm_medium;
  if (medium) {
    const { data: camp } = await sb
      .from("utm_campaigns")
      .select("setter_id")
      .ilike("medium", medium)
      .not("setter_id", "is", null)
      .limit(1);
    setter_id = camp?.[0]?.setter_id || null;
  }

  // Closer from latestCall.user (by email or first name)
  let closer_id: string | null = null;
  const callUser = payload.latestCall?.user;
  if (callUser?.email || callUser?.firstName) {
    const { data: team } = await sb.from("team_members").select("id,nombre,email").eq("is_closer", true);
    const match = (team || []).find((t) => {
      if (callUser.email && t.email?.toLowerCase() === callUser.email.toLowerCase()) return true;
      if (callUser.firstName && t.nombre?.toLowerCase().includes(callUser.firstName.toLowerCase())) return true;
      return false;
    });
    closer_id = match?.id || null;
  }

  const nombre = [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim();
  const instagram = extractInstagram(payload.questionsAndAnswers);
  const nuevoEstado =
    lead?.estado === "cerrado" || lead?.estado === "adentro_seguimiento"
      ? lead.estado
      : mapStatus(payload.status || "");

  const data: Record<string, unknown> = {
    nombre: nombre || null,
    email: payload.email,
    telefono: payload.phoneNumber || null,
    instagram: instagram || null,
    estado: nuevoEstado,
    fecha_agendado: payload.latestCall?.dateTime || null,
    fecha_llamada: payload.latestCall?.dateTime || null,
    setter_id,
    closer_id,
    utm_source: payload.tracking?.utm_source || null,
    utm_medium: payload.tracking?.utm_medium || null,
    utm_content: payload.tracking?.utm_content || null,
    fuente: (payload.tracking?.utm_source || "").toLowerCase() === "inbound" ? "instagram" : "otro",
  };

  const marker = `[iClosed id:${payload.id || "—"} call:${payload.latestCall?.id || "—"}]`;
  const currentNotes = lead?.notas_internas || "";
  if (!currentNotes.includes("[iClosed")) {
    data.notas_internas = currentNotes ? `${currentNotes}\n${marker}` : marker;
  }

  if (lead) {
    await sb.from("leads").update(data).eq("id", lead.id);
    return { action: "updated", leadId: lead.id };
  }
  const { data: ins } = await sb.from("leads").insert(data).select("id").single();
  return { action: "created", leadId: ins?.id };
}

/**
 * Receives webhook events from iClosed.io.
 * Register in iClosed dashboard:
 *   https://crm.backstagge.com/api/iclosed/webhook?s=roms-iclosed-2026
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s") || req.headers.get("x-webhook-secret");
  const secretValid = secret === SECRET;

  let payload: IClosedPayload;
  try {
    payload = (await req.json()) as IClosedPayload;
  } catch {
    payload = {} as IClosedPayload;
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (["authorization", "cookie"].includes(k.toLowerCase())) continue;
    headers[k] = v;
  }

  let result: unknown = null;
  let error: string | null = null;
  try {
    result = await processEvent(payload);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const event = {
    received_at: new Date().toISOString(),
    secret_valid: secretValid,
    hook_type: payload.hookType || "unknown",
    event_type: payload.event || null,
    process_result: result,
    process_error: error,
    payload,
  };

  console.log("[iClosed webhook]", JSON.stringify({ hook: payload.hookType, result, error }));

  try {
    const settings = await getSettings();
    const events = Array.isArray(settings.iclosed_events) ? (settings.iclosed_events as unknown[]) : [];
    events.unshift({ ...event, headers });
    await setSetting("iclosed_events", events.slice(0, 50));
  } catch {}

  return NextResponse.json({ ok: true, result, error });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s");
  if (secret === SECRET) {
    const settings = await getSettings();
    const events = Array.isArray(settings.iclosed_events) ? settings.iclosed_events : [];
    return NextResponse.json({ count: events.length, events });
  }
  const challenge = url.searchParams.get("challenge") || url.searchParams.get("hub.challenge");
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ ok: true, message: "iClosed webhook endpoint" });
}
