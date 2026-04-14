import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSettings, setSetting } from "@/lib/queries/settings";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const data = await getSettings();
  return NextResponse.json({ settings: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json();
    const { key, value } = body;
    if (!key) return NextResponse.json({ error: "key requerido" }, { status: 400 });
    await setSetting(key, value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/settings]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
