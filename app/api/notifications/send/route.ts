import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
let webpushReady = false;

function getWebPush() {
  // Lazy require to avoid module-level evaluation during build
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webpush = require("web-push");
  if (!webpushReady && process.env.VAPID_EMAIL && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    webpushReady = true;
  }
  return webpush;
}

// Notification event types and their recipients
const EVENT_RECIPIENTS: Record<string, { roles?: string[] }> = {
  venta_nueva: { roles: ["admin", "closer", "setter", "cobranzas", "seguimiento"] },
  pago_cuota: { roles: ["admin"] },
  agenda_calendly: {},
  cuota_vencida: {},
  consumio_1a1: {},
  score_rojo: { roles: ["seguimiento"] },
  agente_completo: {},
};

interface SendPayload {
  event: string;
  title: string;
  body: string;
  url?: string;
  recipientIds?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // Validate API key for n8n calls
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: SendPayload = await request.json();
    const { event, title, body: notifBody, url, recipientIds } = body;

    if (!event || !title || !notifBody) {
      return NextResponse.json({ error: "Missing event, title, or body" }, { status: 400 });
    }

    const supabase = createServerClient();

    // Resolve recipients
    let query = supabase
      .from("team_members")
      .select("id, nombre, push_subscription, is_admin, is_closer, is_setter, is_cobranzas, is_seguimiento")
      .eq("activo", true)
      .not("push_subscription", "is", null);

    if (recipientIds && recipientIds.length > 0) {
      query = query.in("id", recipientIds);
    }

    const { data: members, error } = await query;

    if (error || !members) {
      return NextResponse.json({ error: "Failed to fetch recipients" }, { status: 500 });
    }

    // Filter by event type if no explicit recipientIds
    let recipients = members;
    if (!recipientIds && EVENT_RECIPIENTS[event]?.roles) {
      const roles = EVENT_RECIPIENTS[event].roles!;
      recipients = members.filter((m) => {
        if (roles.includes("admin") && m.is_admin) return true;
        if (roles.includes("closer") && m.is_closer) return true;
        if (roles.includes("setter") && m.is_setter) return true;
        if (roles.includes("cobranzas") && m.is_cobranzas) return true;
        if (roles.includes("seguimiento") && m.is_seguimiento) return true;
        return false;
      });
    }

    // Send push to each recipient
    const payload = JSON.stringify({
      title,
      body: notifBody,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-128.png",
      data: { url: url ?? "/" },
    });

    const results = await Promise.allSettled(
      recipients.map(async (member) => {
        try {
          await getWebPush().sendNotification(
            member.push_subscription as unknown as { endpoint: string; keys: { p256dh: string; auth: string } },
            payload
          );
          return { id: member.id, status: "sent" as const };
        } catch (err: unknown) {
          const pushErr = err as { statusCode?: number; message?: string };
          // If subscription expired, clear it
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            await supabase
              .from("team_members")
              .update({ push_subscription: null })
              .eq("id", member.id);
          }
          return { id: member.id, status: "failed" as const, error: pushErr.message };
        }
      })
    );

    const sent = results.filter(
      (r) => r.status === "fulfilled" && (r.value as { status: string }).status === "sent"
    ).length;
    const failed = results.length - sent;

    return NextResponse.json({ sent, failed, total: results.length });
  } catch (error) {
    console.error("Send notification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
