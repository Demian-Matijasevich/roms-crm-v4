import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSetting } from "@/lib/queries/settings";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Receives webhook events from iClosed.io.
 * Stores the last N events in team_members.__SYSTEM_CONFIG__.observaciones.iclosed_events
 * for debugging and payload inspection.
 *
 * To register in iClosed dashboard:
 *   https://crm.backstagge.com/api/iclosed/webhook?s=roms-iclosed-2026
 */
export async function POST(req: NextRequest) {
  // Secret check — accept either query param OR header X-Webhook-Secret,
  // OR allow any (logged) request so we can inspect iClosed's payload first
  const url = new URL(req.url);
  const secret = url.searchParams.get("s") || req.headers.get("x-webhook-secret");
  const secretValid = secret === SECRET;

  // Parse payload
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = { raw: await req.text().catch(() => "(unreadable)") };
  }

  // Collect headers (keep only non-sensitive)
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (["authorization", "cookie"].includes(k.toLowerCase())) continue;
    headers[k] = v;
  }

  const event = {
    received_at: new Date().toISOString(),
    secret_valid: secretValid,
    event_type:
      (payload as Record<string, unknown>)?.type ||
      (payload as Record<string, unknown>)?.event ||
      (payload as Record<string, unknown>)?.eventType ||
      "unknown",
    headers,
    payload,
  };

  // Log to console (visible in Vercel runtime logs)
  console.log("[iClosed webhook]", JSON.stringify(event).substring(0, 2000));

  // Persist last 50 events in settings
  try {
    const settings = await getSettings();
    const events = Array.isArray(settings.iclosed_events) ? (settings.iclosed_events as unknown[]) : [];
    events.unshift(event);
    const trimmed = events.slice(0, 50);
    await setSetting("iclosed_events", trimmed);
  } catch (e) {
    console.error("[iClosed webhook] failed to store:", e);
  }

  // TODO: once we see real payloads, map to leads table.
  // For now: acknowledge and return.

  return NextResponse.json({ ok: true, received: true });
}

/**
 * GET: if secret provided, returns last received events for debugging.
 * Without secret, responds 200 OK so iClosed's verification ping succeeds.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s");
  if (secret === SECRET) {
    const settings = await getSettings();
    const events = Array.isArray(settings.iclosed_events) ? settings.iclosed_events : [];
    return NextResponse.json({ count: events.length, events });
  }
  // Pass any challenge query params back for iClosed validation schemes
  const challenge = url.searchParams.get("challenge") || url.searchParams.get("hub.challenge");
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ ok: true, message: "iClosed webhook endpoint" });
}
