/**
 * GET /api/admin/wa-msgs-debug?group_id=X&pages=10
 * Baja mensajes crudos de un grupo WA sin filtrar por fecha.
 * Sirve para debug (ver si Evolution tiene retención del grupo).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const EVO_INSTANCE = "fran";

interface WaMsg {
  key?: { id?: string; remoteJid?: string; participant?: string };
  message?: { conversation?: string; extendedTextMessage?: { text?: string }; imageMessage?: { caption?: string } };
  messageType?: string;
  messageTimestamp?: number;
  pushName?: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) return NextResponse.json({ error: "envs missing" }, { status: 500 });

  const gid = new URL(req.url).searchParams.get("group_id") || "120363425681899227@g.us";
  const pages = parseInt(new URL(req.url).searchParams.get("pages") || "10", 10);

  const all: WaMsg[] = [];
  const errores: string[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const r = await fetch(`${url}/chat/findMessages/${EVO_INSTANCE}`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ where: { key: { remoteJid: gid } }, page, offset: 50 }),
      });
      if (!r.ok) { errores.push(`page ${page}: HTTP ${r.status}`); break; }
      const j = (await r.json()) as { messages?: { records?: WaMsg[] } };
      const recs = j.messages?.records || [];
      all.push(...recs);
      if (recs.length < 50) break;
    } catch (e) {
      errores.push(`page ${page}: ${(e as Error).message}`);
      break;
    }
  }

  // Extraer solo lo útil
  const compact = all.map((m) => {
    const mt = m.messageType || "";
    const text = mt === "conversation" ? m.message?.conversation :
                 mt === "extendedTextMessage" ? m.message?.extendedTextMessage?.text :
                 mt === "imageMessage" ? m.message?.imageMessage?.caption : "";
    const ts = m.messageTimestamp || 0;
    const fdt = ts > 0 ? new Date((ts - 3 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
    return { wa_id: m.key?.id, fdt, push: m.pushName, mt, text: (text || "").slice(0, 400) };
  });

  return NextResponse.json({
    group_id: gid,
    total: all.length,
    errores,
    ultimos_10: compact.slice(0, 10),
    fdt_min: compact.length ? compact[compact.length - 1].fdt : null,
    fdt_max: compact.length ? compact[0].fdt : null,
  });
}
