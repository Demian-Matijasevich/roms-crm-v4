// app/api/sync/route.ts
// Sync endpoint for ROMS CRM — refreshes health scores
// Google Sheets sync will be handled via n8n webhooks separately

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

// ---- Refresh health scores ----
async function refreshHealthScores(supabase: ReturnType<typeof createServerClient>) {
  const { data: clients } = await supabase
    .from("clients")
    .select("id")
    .eq("estado", "activo");

  if (!clients || clients.length === 0) return { healthUpdated: 0 };

  let updated = 0;
  for (const client of clients) {
    const { data: score } = await supabase.rpc("calculate_health_score", {
      client_uuid: client.id,
    });
    if (score !== null && score !== undefined) {
      await supabase
        .from("clients")
        .update({ health_score: score })
        .eq("id", client.id);
      updated++;
    }
  }

  return { healthUpdated: updated };
}

// ---- POST handler ----
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const serviceKey = request.headers.get("x-service-key");
  const token = (authHeader?.replace("Bearer ", "") || serviceKey || "").trim();

  if (token !== process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    const healthResult = await refreshHealthScores(supabase);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      duration_seconds: duration,
      health: healthResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/sync]", err);
    return NextResponse.json(
      { error: message, duration_seconds: ((Date.now() - startTime) / 1000).toFixed(1) },
      { status: 500 }
    );
  }
}
