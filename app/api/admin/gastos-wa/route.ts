/**
 * GET /api/admin/gastos-wa?mes=YYYY-MM
 *
 * Busca el grupo "GASTOS SECURE SCALE" en la instancia Evolution `fran`,
 * baja los mensajes del mes y los devuelve parseados.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const EVO_INSTANCE = "fran";
const GROUP_NAME = "GASTOS SECURE SCALE";

async function findGroupJid(): Promise<string | null> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("EVOLUTION envs missing");
  // Fetch all groups
  const r = await fetch(`${url}/group/fetchAllGroups/${EVO_INSTANCE}?getParticipants=false`, {
    headers: { apikey: key },
  });
  if (!r.ok) throw new Error(`fetchAllGroups ${r.status}`);
  const groups = await r.json() as Array<{ id?: string; subject?: string }>;
  const found = groups.find((g) => (g.subject || "").toLowerCase().includes(GROUP_NAME.toLowerCase()));
  return found?.id || null;
}

interface WaMsg {
  id?: string;
  key?: { id?: string; remoteJid?: string; participant?: string; participantAlt?: string };
  message?: { conversation?: string; extendedTextMessage?: { text?: string }; imageMessage?: { caption?: string } };
  messageType?: string;
  messageTimestamp?: number;
  pushName?: string;
}

async function fetchMessages(groupJid: string): Promise<WaMsg[]> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const all: WaMsg[] = [];
  for (let page = 1; page <= 30; page++) {
    const r = await fetch(`${url}/chat/findMessages/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { apikey: key!, "Content-Type": "application/json" },
      body: JSON.stringify({ where: { key: { remoteJid: groupJid } }, page, offset: 50 }),
    });
    if (!r.ok) throw new Error(`findMessages ${r.status}`);
    const j = await r.json() as { messages?: { records?: WaMsg[] } };
    const recs = j.messages?.records || [];
    all.push(...recs);
    if (recs.length < 50) break;
  }
  return all;
}

function extractText(m: WaMsg): string {
  const mt = m.messageType || "";
  if (mt === "conversation") return m.message?.conversation || "";
  if (mt === "extendedTextMessage") return m.message?.extendedTextMessage?.text || "";
  if (mt === "imageMessage") return m.message?.imageMessage?.caption || "";
  return "";
}

interface ParsedGasto {
  wa_id: string;
  ts: number;
  fdt: string;
  texto: string;
  push: string | null;
  monto_usd: number | null;
  monto_ars: number | null;
  categoria: string | null;
  concepto: string | null;
  pagado_a: string | null;
  pagado_por: string | null;
}

function parseGasto(m: WaMsg): ParsedGasto | null {
  const txt = extractText(m).trim();
  if (!txt || txt.length < 5) return null;
  const ts = m.messageTimestamp || 0;
  const wa_id = m.key?.id || m.id || `ts_${ts}`;
  const fdt = new Date(ts * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  const low = txt.toLowerCase();

  // ARS
  let monto_ars: number | null = null;
  const arsRe = /(\d{1,3}(?:\.\d{3}){1,3}|\d{5,})\s*(?:pesos|ars|\$ars)?|\bars\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{4,})/gi;
  const arss: number[] = [];
  let mA;
  while ((mA = arsRe.exec(txt)) !== null) {
    const raw = (mA[1] || mA[2] || "").replace(/\./g, "");
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 5000 && n <= 100000000) arss.push(n);
  }
  if (arss.length > 0) monto_ars = Math.max(...arss);

  // USD
  let monto_usd: number | null = null;
  const usdRe = /\$\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(k|mil)?|\busd?\s*(\d{1,5}(?:[.,]\d{1,3})?)|\b(\d{1,5}(?:[.,]\d{1,3})?)\s*usd\b/gi;
  const usds: number[] = [];
  let mU;
  while ((mU = usdRe.exec(txt)) !== null) {
    const raw = (mU[1] || mU[3] || mU[4] || "").replace(/[.,]/g, "");
    let n = parseInt(raw, 10);
    if (isNaN(n)) continue;
    if ((mU[2] || "").toLowerCase().match(/k|mil/)) n *= 1000;
    if (n >= 10 && n <= 50000) usds.push(n);
  }
  if (usds.length > 0) monto_usd = Math.max(...usds);

  // Categoría (heurística)
  let categoria: string | null = null;
  if (/comisi[oó]n|comision/i.test(low)) categoria = "comisiones";
  else if (/sueldo|salario/i.test(low)) categoria = "sueldos";
  else if (/publicidad|ads|meta|facebook|instagram|tiktok|google\s*ads/i.test(low)) categoria = "publicidad";
  else if (/servidor|hosting|dominio|vps|coolify|vercel|supabase|render|aws|cloud/i.test(low)) categoria = "infraestructura";
  else if (/software|licencia|suscri|subscri|chatgpt|claude|openai/i.test(low)) categoria = "software";
  else if (/setter|closer/i.test(low)) categoria = "comisiones";
  else if (/impuest|iva|monotri|arca|afip/i.test(low)) categoria = "impuestos";
  else if (/refund|reembolso|devoluci[oó]n/i.test(low)) categoria = "refund";
  else if (/mel|melanie/i.test(low)) categoria = "sueldos";

  // Pagado_por: quien mandó el mensaje
  const push = m.pushName || null;
  let pagado_por: string | null = null;
  if (push) {
    if (/juanma|juan\s*ma/i.test(push)) pagado_por = "JUANMA";
    else if (/fran/i.test(push)) pagado_por = "FRAN";
    else if (/mati|matias/i.test(push)) pagado_por = "MATI";
  }

  // Concepto: primera línea o texto corto
  const lines = txt.split("\n").map(l=>l.trim()).filter(Boolean);
  let concepto = lines[0] || txt.slice(0, 80);
  if (concepto.length > 100) concepto = concepto.slice(0, 100);

  // Pagado_a: heurística — buscar patrón "para X" o el receptor
  let pagado_a: string | null = null;
  const paMatch = low.match(/(?:para|a)\s+([a-záéíóúñ ]{3,20})/);
  if (paMatch) pagado_a = paMatch[1].trim();

  return { wa_id, ts, fdt, texto: txt, push, monto_usd, monto_ars, categoria, concepto, pagado_a, pagado_por };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const mes = url.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "mes inválido" }, { status: 400 });
  const [y, m] = mes.split("-").map(Number);
  const tsStart = Math.floor(Date.UTC(y, m - 1, 1, 3) / 1000);
  const tsEnd = Math.floor(Date.UTC(y, m, 1, 3) / 1000);

  let groupJid: string | null;
  try {
    groupJid = await findGroupJid();
  } catch (e) {
    return NextResponse.json({ error: `find_group: ${(e as Error).message}` }, { status: 502 });
  }
  if (!groupJid) return NextResponse.json({ error: `Grupo "${GROUP_NAME}" no encontrado en instancia ${EVO_INSTANCE}` }, { status: 404 });

  let allMsj: WaMsg[];
  try {
    allMsj = await fetchMessages(groupJid);
  } catch (e) {
    return NextResponse.json({ error: `fetch_messages: ${(e as Error).message}` }, { status: 502 });
  }

  const mesMsj = allMsj.filter(x => {
    const t = x.messageTimestamp || 0;
    return t >= tsStart && t < tsEnd;
  });

  const parsed: ParsedGasto[] = [];
  const seen = new Set<string>();
  for (const m of mesMsj) {
    const p = parseGasto(m);
    if (!p) continue;
    if (seen.has(p.wa_id)) continue;
    seen.add(p.wa_id);
    parsed.push(p);
  }

  // Mensajes con imagen (posiblemente comprobantes de transferencia)
  const withImages = mesMsj
    .filter(x => x.messageType === "imageMessage")
    .map(x => ({
      wa_id: x.key?.id,
      ts: x.messageTimestamp,
      fdt: new Date((x.messageTimestamp||0)*1000 - 3*3600*1000).toISOString().slice(0,16).replace("T"," "),
      push: x.pushName,
      caption: x.message?.imageMessage?.caption || "",
      remoteJid: x.key?.remoteJid,
    }));

  return NextResponse.json({
    group_jid: groupJid,
    mes,
    total_msj_grupo: mesMsj.length,
    parseados: parsed.length,
    gastos: parsed,
    imagenes: withImages,
  });
}
