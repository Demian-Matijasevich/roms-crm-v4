/**
 * Webhook de Calendly v2.
 *
 * Calendly manda eventos `invitee.created` cuando alguien agenda y
 * `invitee.canceled` cuando cancela. La estructura es estable en v2.
 *
 * Registrar en Calendly:
 *   - via Admin API: POST /webhook_subscriptions con url=
 *     https://crm.backstagge.com/api/calendly/webhook?s=roms-calendly-2026
 *   - events: ["invitee.created", "invitee.canceled"]
 *   - scope: organization (para captar todos los hosts)
 *
 * Lógica:
 *   1. match closer por email del host (event_memberships[0].user_email)
 *   2. match setter por UTMs (utm_campaigns table)
 *   3. detecta nicho política por nombre del event_type o por UTMs
 *   4. crea o actualiza lead en supabase
 *   5. sync a Google Sheet (best-effort, no bloquea)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSetting } from "@/lib/queries/settings";
import { createServerClient } from "@/lib/supabase-server";
import { upsertLeadToSheet } from "@/lib/sheets-write";
import { createNotificationsForPolitica } from "@/lib/notifications";

const SECRET = process.env.CALENDLY_WEBHOOK_SECRET || "roms-calendly-2026";

interface CalendlyTracking {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_campaign?: string | null;
  salesforce_uuid?: string | null;
}

interface CalendlyQA {
  question: string;
  answer: string;
}

interface CalendlyEventMembership {
  user_email?: string;
  user_name?: string;
  user?: string;
}

interface CalendlyScheduledEvent {
  uri?: string;
  name?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  event_memberships?: CalendlyEventMembership[];
  event_type?: string;
}

interface CalendlyPayload {
  event?: string;
  created_at?: string;
  payload?: {
    cancel_url?: string;
    created_at?: string;
    email?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    text_reminder_number?: string;
    timezone?: string;
    tracking?: CalendlyTracking;
    questions_and_answers?: CalendlyQA[];
    scheduled_event?: CalendlyScheduledEvent;
    status?: string;
    cancellation?: { canceler_type?: string; reason?: string };
    rescheduled?: boolean;
  };
}

function mapStatus(eventKind: string, payloadStatus?: string, cancelled?: boolean): string {
  if (cancelled || eventKind === "invitee.canceled") return "cancelada";
  if (payloadStatus === "canceled") return "cancelada";
  return "pendiente";
}

function extractInstagram(qa: CalendlyQA[] | undefined): string | null {
  if (!qa) return null;
  for (const q of qa) {
    const k = (q.question || "").toLowerCase();
    if (k.includes("instagram") || k.includes("ig") || k.includes("usuario") || k.includes("@")) {
      if (q.answer) return q.answer.replace(/^@/, "").trim();
    }
  }
  return null;
}

function extractTelefono(payload: CalendlyPayload["payload"]): string | null {
  if (payload?.text_reminder_number) return payload.text_reminder_number;
  if (!payload?.questions_and_answers) return null;
  for (const q of payload.questions_and_answers) {
    const k = (q.question || "").toLowerCase();
    if (k.includes("tel") || k.includes("phone") || k.includes("whatsapp") || k.includes("celular")) {
      if (q.answer) return q.answer.trim();
    }
  }
  return null;
}

function detectNicho(p: CalendlyPayload): "politica" | "general" {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const eventName = norm(p.payload?.scheduled_event?.name || "");
  if (eventName.includes("politic")) return "politica";
  const t = p.payload?.tracking || {};
  const utms = [t.utm_source, t.utm_medium, t.utm_content, t.utm_campaign].map((v) => norm(String(v || "")));
  if (utms.some((u) => u.includes("politic"))) return "politica";
  return "general";
}

async function processEvent(payload: CalendlyPayload) {
  const inner = payload.payload;
  if (!inner?.email) return { skipped: "no email" };
  const sb = createServerClient();

  const { data: existing } = await sb
    .from("leads")
    .select("id, estado, notas_internas, fecha_llamada")
    .eq("email", inner.email)
    .limit(1);
  const lead = existing?.[0];

  // Setter por UTM (igual lógica que iClosed)
  let setter_id: string | null = null;
  const medium = inner.tracking?.utm_medium;
  const content = inner.tracking?.utm_content;
  if (medium) {
    if (content) {
      const { data: campSpec } = await sb
        .from("utm_campaigns")
        .select("setter_id")
        .ilike("medium", medium)
        .ilike("content", content)
        .not("setter_id", "is", null)
        .limit(1);
      setter_id = campSpec?.[0]?.setter_id || null;
    }
    if (!setter_id) {
      const { data: camp } = await sb
        .from("utm_campaigns")
        .select("setter_id")
        .ilike("medium", medium)
        .not("setter_id", "is", null)
        .limit(1);
      setter_id = camp?.[0]?.setter_id || null;
    }
  }

  // Closer por email del primer event_membership (el host de Calendly)
  let closer_id: string | null = null;
  let closer_nombre: string | null = null;
  const hostEmail = inner.scheduled_event?.event_memberships?.[0]?.user_email || null;
  if (hostEmail) {
    const { data: team } = await sb.from("team_members").select("id,nombre,email").eq("is_closer", true);
    const match = (team || []).find((t) => t.email?.toLowerCase() === hostEmail.toLowerCase());
    closer_id = match?.id || null;
    closer_nombre = match?.nombre || null;
  }

  let setter_nombre: string | null = null;
  if (setter_id) {
    const { data: s } = await sb.from("team_members").select("nombre").eq("id", setter_id).maybeSingle();
    setter_nombre = s?.nombre || null;
  }

  const nombre = inner.name || [inner.first_name, inner.last_name].filter(Boolean).join(" ").trim() || null;
  const instagram = extractInstagram(inner.questions_and_answers);
  const telefono = extractTelefono(inner);

  const VENDIDO = ["cerrado", "reserva", "adentro_seguimiento"];
  const cancelled = payload.event === "invitee.canceled" || !!inner.cancellation;
  const nuevoEstado = lead && VENDIDO.includes(lead.estado)
    ? lead.estado
    : mapStatus(payload.event || "", inner.status, cancelled);

  // En Calendly start_time es cuándo se agendó la llamada (todavía no ocurrió)
  const scheduledDateTime = inner.scheduled_event?.start_time || null;

  const nichoDetectado = detectNicho(payload);

  const data: Record<string, unknown> = {
    nombre,
    email: inner.email,
    telefono,
    instagram,
    estado: nuevoEstado,
    fecha_agendado: scheduledDateTime,
    fecha_llamada: lead?.fecha_llamada ?? null,
    utm_source: inner.tracking?.utm_source || null,
    utm_medium: inner.tracking?.utm_medium || null,
    utm_content: inner.tracking?.utm_content || null,
    fuente: (inner.tracking?.utm_source || "").toLowerCase() === "inbound" ? "instagram" : "otro",
    nicho: nichoDetectado,
  };

  // closer_id / setter_id: solo escribir si los matcheamos en este evento.
  if (closer_id) data.closer_id = closer_id;
  if (setter_id) data.setter_id = setter_id;

  if (nichoDetectado === "politica" && !lead) {
    data.etapa_politica = "nuevo";
    data.closer_id = null;
  }

  const eventUri = inner.scheduled_event?.uri || "—";
  const marker = `[Calendly ${eventUri.split("/").pop() || eventUri}]`;
  const currentNotes = lead?.notas_internas || "";
  if (!currentNotes.includes("[Calendly")) {
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

  if (action === "created" && nichoDetectado === "politica" && leadId) {
    await createNotificationsForPolitica({
      tipo: "info",
      titulo: `🆕 Nuevo lead política: ${nombre || inner.email}`,
      mensaje: inner.tracking?.utm_source ? `Fuente: ${inner.tracking.utm_source}` : "Llegó desde Calendly",
      link: `/pipeline?lead=${leadId}`,
      meta: { lead_id: leadId, source: "calendly" },
    });
  }

  // Sync a Sheet en background (no bloquea el webhook)
  if (leadId) {
    const { data: fresh } = await sb
      .from("leads")
      .select("id, sheets_row_index, nombre, instagram, email, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, fuente")
      .eq("id", leadId)
      .single();
    if (fresh) {
      const targetLeadId = leadId;
      void upsertLeadToSheet({
        ...fresh,
        closer_nombre,
        setter_nombre,
        receptor: null,
      }).then(async (sheetRow) => {
        if (sheetRow && !fresh.sheets_row_index) {
          await sb.from("leads").update({ sheets_row_index: sheetRow }).eq("id", targetLeadId);
        }
      }).catch(() => null);
    }
  }

  return { action, leadId, event: payload.event };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s") || req.headers.get("x-webhook-secret");
  const secretValid = secret === SECRET;
  if (!secretValid) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  let payload: CalendlyPayload;
  try {
    payload = (await req.json()) as CalendlyPayload;
  } catch {
    payload = {} as CalendlyPayload;
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
    event_type: payload.event || "unknown",
    process_result: result,
    process_error: error,
    payload,
  };

  console.log("[Calendly webhook]", JSON.stringify({ event: payload.event, result, error }));

  try {
    const settings = await getSettings();
    const events = Array.isArray(settings.calendly_events) ? (settings.calendly_events as unknown[]) : [];
    events.unshift({ ...event, headers });
    await setSetting("calendly_events", events.slice(0, 50));
  } catch {}

  return NextResponse.json({ ok: true, result, error });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s");
  if (secret === SECRET) {
    const settings = await getSettings();
    const events = Array.isArray(settings.calendly_events) ? settings.calendly_events : [];
    return NextResponse.json({ count: events.length, events });
  }
  return NextResponse.json({ ok: true, message: "Calendly webhook endpoint" });
}
