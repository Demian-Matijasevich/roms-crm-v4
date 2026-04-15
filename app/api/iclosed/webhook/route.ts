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
  // Secret check
  const url = new URL(req.url);
  const secret = url.searchParams.get("s");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

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
 * GET returns the last received events — for debugging from the browser.
 * Requires the same secret.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }
  const settings = await getSettings();
  const events = Array.isArray(settings.iclosed_events) ? settings.iclosed_events : [];
  return NextResponse.json({ count: events.length, events });
}
