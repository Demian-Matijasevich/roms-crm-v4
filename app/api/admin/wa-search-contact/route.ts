/**
 * GET /api/admin/wa-search-contact?suffix=9781
 * Busca chats/contactos en Evolution API cuyo numero termine con el sufijo dado.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const EVO_INSTANCE = "fran";

interface Chat {
  id?: string;
  remoteJid?: string;
  pushName?: string;
  name?: string;
  labels?: string[];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) return NextResponse.json({ error: "envs missing" }, { status: 500 });

  const u = new URL(req.url);
  const suffix = (u.searchParams.get("suffix") || "").replace(/\D/g, "");
  if (!suffix) return NextResponse.json({ error: "suffix required" }, { status: 400 });

  const chatsResp = await fetch(`${url}/chat/findChats/${EVO_INSTANCE}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!chatsResp.ok) return NextResponse.json({ error: `findChats ${chatsResp.status}` }, { status: 502 });
  const chats = (await chatsResp.json()) as Chat[];

  // Filtrar por remoteJid ending with suffix
  const matches = chats.filter((c) => {
    const jid = (c.remoteJid || c.id || "").replace(/@.*/, "").replace(/\D/g, "");
    return jid.endsWith(suffix);
  }).map((c) => ({
    jid: c.remoteJid || c.id,
    pushName: c.pushName || c.name || null,
    labels: c.labels || [],
  }));

  return NextResponse.json({ total_chats: chats.length, suffix, matches_count: matches.length, matches });
}
