import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/queries/settings";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

// Re-uses the same processing logic as the webhook handler.
// Reads from settings.iclosed_events and processes each payload.

interface IClosedPayload {
  id?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  status?: string;
  previewId?: string;
  questionsAndAnswers?: Record<string, string>;
  tracking?: { utm_source?: string; utm_medium?: string; utm_content?: string; utm_campaign?: string };
  latestCall?: {
    id?: number;
    dateTime?: string;
    user?: { id?: number; firstName?: string; lastName?: string; email?: string };
  };
  hookType?: string;
}

function mapStatus(s: string): string {
  const u = (s || "").toUpperCase();
  if (u === "STRATEGY_CALL_BOOKED" || u === "DISCOVERY_CALL_BOOKED" || u === "QUALIFIED" || u === "POTENTIAL") return "pendiente";
  if (u === "DISQUALIFIED") return "no_calificado";
  return "pendiente";
}

function extractInstagram(qa?: Record<string, string>): string | null {
  if (!qa) return null;
  for (const [k, v] of Object.entries(qa)) {
    if (k.endsWith("_question") || k.endsWith("_response")) continue;
    if (k.toLowerCase().includes("instagram") && v) return v.replace(/^@/, "").trim();
  }
  return null;
}

async function processEvent(payload: IClosedPayload, sb: ReturnType<typeof createServerClient>) {
  if (!payload.email) return { skipped: "no email" };

  const { data: existing } = await sb
    .from("leads")
    .select("id, estado, notas_internas")
    .eq("email", payload.email)
    .limit(1);
  const lead = existing?.[0];

  let setter_id: string | null = null;
  const medium = payload.tracking?.utm_medium;
  if (medium) {
    const { data: camp } = await sb
      .from("utm_campaigns").select("setter_id").ilike("medium", medium).not("setter_id", "is", null).limit(1);
    setter_id = camp?.[0]?.setter_id || null;
  }

  let closer_id: string | null = null;
  const u = payload.latestCall?.user;
  if (u?.email || u?.firstName) {
    const { data: team } = await sb.from("team_members").select("id,nombre,email").eq("is_closer", true);
    const match = (team || []).find((t) => {
      if (u.email && t.email?.toLowerCase() === u.email.toLowerCase()) return true;
      if (u.firstName && t.nombre?.toLowerCase().includes(u.firstName.toLowerCase())) return true;
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
    return { action: "updated", leadId: lead.id, email: payload.email, nombre };
  }
  const { data: ins } = await sb.from("leads").insert(data).select("id").single();
  return { action: "created", leadId: ins?.id, email: payload.email, nombre };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = createServerClient();
  const settings = await getSettings();
  const events = Array.isArray(settings.iclosed_events) ? (settings.iclosed_events as Array<{ payload?: IClosedPayload }>) : [];

  const results: unknown[] = [];
  let created = 0, updated = 0, skipped = 0, errors = 0;
  const seenEmails = new Set<string>();

  // Process oldest first so latest updates win
  const ordered = [...events].reverse();

  for (const e of ordered) {
    const p = e.payload as IClosedPayload | undefined;
    if (!p || !p.email) { skipped++; continue; }
    // Dedup emails within the batch — only the latest event per email matters,
    // but since we process oldest→newest, newer updates overwrite.
    seenEmails.add(p.email);
    try {
      const r = await processEvent(p, sb);
      results.push(r);
      if ((r as { action?: string }).action === "created") created++;
      else if ((r as { action?: string }).action === "updated") updated++;
      else skipped++;
    } catch (err) {
      errors++;
      results.push({ error: err instanceof Error ? err.message : String(err), email: p.email });
    }
  }

  return NextResponse.json({
    total_events: events.length,
    unique_emails: seenEmails.size,
    created,
    updated,
    skipped,
    errors,
    results,
  });
}
