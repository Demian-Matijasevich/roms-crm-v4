/**
 * GET /api/admin/wa-media?wa_id=X
 * Descarga el media (imagen/video/audio) de un mensaje WA por wa_id via Evolution API.
 * Devuelve el binario con el content-type apropiado.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const EVO_INSTANCE = "fran";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) return NextResponse.json({ error: "envs missing" }, { status: 500 });

  const u = new URL(req.url);
  const wa_id = u.searchParams.get("wa_id");
  if (!wa_id) return NextResponse.json({ error: "wa_id required" }, { status: 400 });

  const r = await fetch(`${url}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { key: { id: wa_id } }, convertToMp4: false }),
  });

  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json({ error: `evolution ${r.status}: ${t.slice(0, 300)}` }, { status: 502 });
  }

  const j = (await r.json()) as { base64?: string; mimetype?: string; fileName?: string };
  if (!j.base64) return NextResponse.json({ error: "no base64 in response", raw: j }, { status: 502 });

  const buf = Buffer.from(j.base64, "base64");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": j.mimetype || "application/octet-stream",
      "Content-Disposition": `inline; filename="${j.fileName || wa_id}"`,
    },
  });
}
