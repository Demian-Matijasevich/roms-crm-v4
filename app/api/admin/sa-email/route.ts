import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return NextResponse.json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not set" }, { status: 500 });
  try {
    const creds = JSON.parse(raw);
    return NextResponse.json({
      client_email: creds.client_email,
      project_id: creds.project_id,
      instructions: "Compartí el Sheet con este email (rol: Editor) para que la app pueda escribir.",
    });
  } catch (e) {
    return NextResponse.json({ error: "JSON parse error: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
