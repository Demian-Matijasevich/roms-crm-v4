/**
 * GET /api/admin/wa-msgs-debug?group_id=X&pages=10&since=YYYY-MM-DD
 * Baja mensajes crudos de un grupo WA. Con `since`, filtra >= esa fecha.
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

  const u = new URL(req.url);
  const gid = u.searchParams.get("group_id") || "120363425681899227@g.us";
  const pages = parseInt(u.searchParams.get("pages") || "10", 10);
  const since = u.searchParams.get("since");
  const sinceTs = since ? Math.floor(new Date(`${since}T00:00:00-03:00`).getTime() / 1000) : 0;

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

  const filtered = sinceTs ? all.filter((m) => (m.messageTimestamp || 0) >= sinceTs) : all;
  const compact = filtered.map((m) => {
    const mt = m.messageType || "";
    const text = mt === "conversation" ? m.message?.conversation :
                 mt === "extendedTextMessage" ? m.message?.extendedTextMessage?.text :
                 mt === "imageMessage" ? m.message?.imageMessage?.caption : "";
    const ts = m.messageTimestamp || 0;
    const fdt = ts > 0 ? new Date((ts - 3 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
    return { wa_id: m.key?.id, fdt, push: m.pushName, mt, text: (text || "").slice(0, 400) };
  }).sort((a, b) => (a.fdt || "").localeCompare(b.fdt || ""));

  return NextResponse.json({ group_id: gid, total: all.length, filtered: filtered.length, errores, msgs: compact });
}
