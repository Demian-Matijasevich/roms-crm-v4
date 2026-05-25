import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSetting } from "@/lib/queries/settings";
import { createServerClient } from "@/lib/supabase-server";
import { upsertLeadToSheet } from "@/lib/sheets-write";

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

function mapStatus(iclosedStatus: string, hookType?: string): string {
  const s = (iclosedStatus || "").toUpperCase();
  const h = (hookType || "").toUpperCase();
  // Cancelaciones / no-shows / reagendas (puede venir por hookType o por status)
  if (h.includes("CANCEL") || s.includes("CANCEL")) return "cancelada";
  if (h.includes("RESCHEDUL") || s.includes("RESCHEDUL") || s.includes("REBOOK")) return "reprogramada";
  if (h.includes("NO_SHOW") || s.includes("NO_SHOW") || s.includes("NOSHOW")) return "no_show";
  // Bookings y calificaciones
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
    .select("id, estado, notas_internas, fecha_llamada")
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
  let closer_nombre: string | null = null;
  const callUser = payload.latestCall?.user;
  if (callUser?.email || callUser?.firstName) {
    const { data: team } = await sb.from("team_members").select("id,nombre,email").eq("is_closer", true);
    const match = (team || []).find((t) => {
      if (callUser.email && t.email?.toLowerCase() === callUser.email.toLowerCase()) return true;
      if (callUser.firstName && t.nombre?.toLowerCase().includes(callUser.firstName.toLowerCase())) return true;
      return false;
    });
    closer_id = match?.id || null;
    closer_nombre = match?.nombre || null;
  }

  // Setter nombre for Sheet display
  let setter_nombre: string | null = null;
  if (setter_id) {
    const { data: s } = await sb.from("team_members").select("nombre").eq("id", setter_id).maybeSingle();
    setter_nombre = s?.nombre || null;
  }

  const nombre = [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim();
  const instagram = extractInstagram(payload.questionsAndAnswers);
  // Si el lead ya está vendido (cerrado/reserva/adentro_seguimiento) NO lo
  // tocamos por más que iClosed mande reagenda o cancela — la venta queda.
  const VENDIDO = ["cerrado", "reserva", "adentro_seguimiento"];
  const nuevoEstado = lead && VENDIDO.includes(lead.estado)
    ? lead.estado
    : mapStatus(payload.status || "", payload.hookType);

  // fecha_agendado = cuando se booked la call (iClosed dateTime)
  // fecha_llamada = solo cuando la call ya ocurrió (status != BOOKED)
  const iclosedStatusUpper = (payload.status || "").toUpperCase();
  const isBookedOnly = iclosedStatusUpper.includes("BOOKED");
  const scheduledDateTime = payload.latestCall?.dateTime || null;

  const data: Record<string, unknown> = {
    nombre: nombre || null,
    email: payload.email,
    telefono: payload.phoneNumber || null,
    instagram: instagram || null,
    estado: nuevoEstado,
    fecha_agendado: scheduledDateTime,
    fecha_llamada: isBookedOnly ? (lead?.fecha_llamada ?? null) : scheduledDateTime,
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

  let leadId: string | null = null;
  let action: "created" | "updated" = "updated";
  if (lead) {
    await sb.from("leads").update(data).eq("id", lead.id);
    leadId = lead.id;
  } else {
    const { data: ins } = await sb.from("leads").insert(data).select("id").single();
    leadId = ins?.id || null;
    action = "created";
  }

  // Sync to Sheet (best-effort, don't fail the webhook)
  let sheetRow: number | null = null;
  if (leadId) {
    const { data: fresh } = await sb
      .from("leads")
      .select("id, sheets_row_index, nombre, instagram, email, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, fuente")
      .eq("id", leadId)
      .single();
    if (fresh) {
      sheetRow = await upsertLeadToSheet({
        ...fresh,
        closer_nombre,
        setter_nombre,
        receptor: null,
      });
      if (sheetRow && !fresh.sheets_row_index) {
        await sb.from("leads").update({ sheets_row_index: sheetRow }).eq("id", leadId);
      }
    }
  }

  return { action, leadId, sheetRow };
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
