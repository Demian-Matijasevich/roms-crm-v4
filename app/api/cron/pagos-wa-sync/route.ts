/**
 * GET /api/cron/pagos-wa-sync?token=XXX&date=YYYY-MM-DD
 *
 * Sincroniza pagos del grupo de WhatsApp "PAGOS SECURE SCALE" con el CRM.
 * Híbrido:
 *   - Auto-carga reportes "claros" (nombre + programa + monto USD/ARS limpio + closer identificable)
 *   - Marca para revisión los "ambiguos" (fees parciales, capturas sin caption, etc)
 *
 * Idempotente: cada payment lleva en notas un marker [WA_MSG:<wa_id>] que se
 * chequea antes de crear, así en re-runs no duplica.
 *
 * Resultado: { auto_cargados: N, pendientes_review: [{ ... }], errores: [...] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const EVO_GROUP_ID = "120363425681899227@g.us"; // PAGOS SECURE SCALE
const EVO_INSTANCE = "fran";

interface WaMsg {
  id?: string;
  key?: { id?: string; remoteJid?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
  };
  messageType?: string;
  messageTimestamp?: number;
  pushName?: string;
}

interface TeamMember {
  id: string;
  nombre: string;
  is_closer: boolean;
  is_setter: boolean;
  is_cobranzas: boolean;
}

interface ParsedReport {
  wa_id: string;
  ts: number;
  fdt_art: string;
  texto: string;
  cliente: string | null;
  monto_usd: number | null;
  monto_ars: number | null;
  tipo: "pif" | "cuota_1" | "cuota_n" | "fee_parcial" | "renovacion" | "desconocido";
  numero_cuota: number;
  closer_hint: string | null;
  programa: string | null;
  is_clear: boolean; // si es claro → auto-carga; si no → review
  reason: string;
}

async function fetchWaMessages(): Promise<WaMsg[]> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("EVOLUTION envs missing");
  const all: WaMsg[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${url}/chat/findMessages/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ where: { key: { remoteJid: EVO_GROUP_ID } }, page, offset: 50 }),
    });
    if (!r.ok) throw new Error(`evolution ${r.status}`);
    const j = (await r.json()) as { messages?: { records?: WaMsg[] } };
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

function parseReport(m: WaMsg): ParsedReport | null {
  const txt = extractText(m).trim();
  if (!txt || txt.length < 20) return null;
  const lines = txt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);
  if (lines.length === 0) return null;

  const ts = m.messageTimestamp || 0;
  const wa_id = m.key?.id || m.id || `ts_${ts}`;
  const fdt = new Date(ts * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");

  // Filtro de basura
  const lowerAll = txt.toLowerCase();
  if (lowerAll.startsWith("setter ")) return null; // mensajes tipo "SETTER IGNA"
  if (/^(ok|si|no|jajaj|.{1,5})$/i.test(txt.trim())) return null;
  if (lowerAll.includes("tronscan") && !lowerAll.match(/\b(omni|multi|cuota|pif)\b/)) return null;
  // Debe mencionar pago-keywords
  if (!/(omni|multi|consult|cuota|pif|fee|pago|recibe|closer|setter)/i.test(lowerAll))
    return null;

  // Nombre cliente (primera línea, descartando emojis/leaders)
  let cliente: string | null = lines[0].replace(/^[*\-•📋👤🆕💰]+\s*/u, "").trim();
  // Si la primera línea es solo un teléfono, agarrar la siguiente
  if (/^\+?[\d\s\-]+$/.test(cliente)) cliente = lines[1]?.trim() || null;
  if (cliente && cliente.length > 50) cliente = cliente.slice(0, 50);
  if (!cliente || cliente.length < 3) return null;

  // Programa
  let programa: string | null = null;
  if (/multi/i.test(txt)) programa = "Multicuentas";
  else if (/omni/i.test(txt)) programa = "Omnipresencia";
  else if (/consult|curso/i.test(txt)) programa = "Consultoría";

  // Closer hint
  let closer_hint: string | null = null;
  const closer_match = lowerAll.match(/closer\s+(valen|valentino|agust|juan(?:cito|martin| martín| blanco)?|nacho|nico|seba|fede)/);
  if (closer_match) {
    const c = closer_match[1];
    if (c.startsWith("valen")) closer_hint = "Valentino";
    else if (c.startsWith("agust")) closer_hint = "Agustín";
    else if (c.startsWith("juan") || c.startsWith("juanc")) closer_hint = "Juan Martín";
    else if (c.startsWith("nacho")) closer_hint = "Nacho";
    else if (c.startsWith("nico")) closer_hint = "Nicolás";
    else if (c.startsWith("seba")) closer_hint = "Seba";
    else if (c.startsWith("fede")) closer_hint = "Fede";
  }

  // Montos
  let monto_usd: number | null = null;
  let monto_ars: number | null = null;
  // USD patterns: $X.XXX | X k | XusD | USD X
  const usdRe = /\$\s*(\d{1,3}(?:[.,]\d{3})*|\d+)(?:\s*k|\s*mil)?\b|\b(\d{1,3}(?:[.,]?\d{3})*|\d+)\s*k\b(?![a-z])|\busd\s*(\d{1,3}(?:[.,]\d{3})*|\d+)/gi;
  const usds: number[] = [];
  let m1;
  while ((m1 = usdRe.exec(txt)) !== null) {
    const raw = (m1[1] || m1[2] || m1[3] || "").replace(/[.,]/g, "");
    let n = parseInt(raw, 10);
    if (isNaN(n)) continue;
    if (m1[0].toLowerCase().includes("k")) n *= 1000;
    if (n >= 500 && n <= 200000) usds.push(n);
  }
  if (usds.length > 0) monto_usd = Math.max(...usds);

  // ARS: "1.406.000 pesos" / "500.000 pesos" / "ARS 500000"
  const arsRe = /(\d{1,3}(?:\.\d{3}){1,3})\s*(?:pesos|ars|\$ars)|ars\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{4,})/gi;
  const arss: number[] = [];
  let m2;
  while ((m2 = arsRe.exec(txt)) !== null) {
    const raw = (m2[1] || m2[2] || "").replace(/\./g, "");
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 10000 && n <= 100000000) arss.push(n);
  }
  if (arss.length > 0) monto_ars = Math.max(...arss);

  // Tipo
  let tipo: ParsedReport["tipo"] = "desconocido";
  let numero_cuota = 1;
  if (/\bpif\b/i.test(txt)) tipo = "pif";
  else if (/segund[ao]\s+cuota|cuota\s*2|2\s*\/\s*\d|completa\s+segund/i.test(lowerAll)) {
    tipo = "cuota_n";
    numero_cuota = 2;
  } else if (/tercera\s+cuota|3\s*\/\s*\d|cuota\s*3/i.test(lowerAll)) {
    tipo = "cuota_n";
    numero_cuota = 3;
  } else if (/primera\s+cuota|cuota\s*1/i.test(lowerAll)) {
    tipo = "cuota_1";
  } else if (/renov/i.test(lowerAll)) tipo = "renovacion";
  else if (/^fee\b|^\d+\s*usd?\s*paga/i.test(lowerAll) || /fee\s*(de\s*)?\d/i.test(lowerAll)) {
    tipo = "fee_parcial";
  }

  // is_clear: claro si tiene monto + programa + tipo no-ambiguo
  let is_clear = true;
  let reason = "OK";
  if (!monto_usd && !monto_ars) {
    is_clear = false;
    reason = "Sin monto detectado";
  } else if (tipo === "fee_parcial" || tipo === "desconocido") {
    is_clear = false;
    reason = tipo === "fee_parcial" ? "Fee parcial — pendiente completar" : "Tipo de pago no identificable";
  } else if (!programa) {
    is_clear = false;
    reason = "Programa no identificado";
  } else if (/después\s+completa|completa\s+en\s+efectivo|después.*efectivo|en\s+\d+\s+(día|semana)/i.test(lowerAll)) {
    is_clear = false;
    reason = "Pago parcial — completa después";
  }

  return {
    wa_id,
    ts,
    fdt_art: fdt,
    texto: txt,
    cliente,
    monto_usd,
    monto_ars,
    tipo,
    numero_cuota,
    closer_hint,
    programa,
    is_clear,
    reason,
  };
}

async function findLeadByName(sb: SupabaseClient, query: string): Promise<{ id: string; nombre: string; closer_id: string | null } | null> {
  if (!query || query.length < 3) return null;
  const parts = query
    .split(/\s+/)
    .filter((p) => p.length >= 4)
    .map((p) => p.toLowerCase());
  for (const part of parts) {
    const { data } = await sb
      .from("leads")
      .select("id,nombre,closer_id")
      .ilike("nombre", `%${part}%`)
      .limit(3);
    const matches = (data || []) as { id: string; nombre: string; closer_id: string | null }[];
    if (matches.length > 0) {
      // Best: nombre que contenga TODOS los parts
      for (const l of matches) {
        const ln = (l.nombre || "").toLowerCase();
        if (parts.every((p) => ln.includes(p))) return l;
      }
      return matches[0];
    }
  }
  return null;
}

async function alreadyLoaded(sb: SupabaseClient, wa_id: string): Promise<boolean> {
  const { data } = await sb
    .from("payments")
    .select("id")
    .ilike("notas", `%[WA_MSG:${wa_id}]%`)
    .limit(1);
  return (data || []).length > 0;
}

interface SyncResult {
  date: string;
  total_msj_grupo: number;
  reports_parseados: number;
  auto_cargados: Array<{ wa_id: string; cliente: string; monto_usd: number | null; monto_ars: number | null; tipo: string }>;
  pendientes_review: Array<{ wa_id: string; fdt: string; cliente: string | null; razon: string; texto_short: string }>;
  errores: Array<{ wa_id: string; error: string }>;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const expected = process.env.EOD_CRON_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dateParam = url.searchParams.get("date");
  const todayArt = dateParam
    ? new Date(`${dateParam}T00:00:00-03:00`)
    : new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const yyyy = todayArt.getFullYear();
  const mm = todayArt.getMonth();
  const dd = todayArt.getDate();
  const dayStartUtc = new Date(Date.UTC(yyyy, mm, dd, 3, 0, 0));
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);
  const tsStart = Math.floor(dayStartUtc.getTime() / 1000);
  const tsEnd = Math.floor(dayEndUtc.getTime() / 1000);
  const isoDate = `${yyyy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  const sb = createServerClient();

  let allMsj: WaMsg[];
  try {
    allMsj = await fetchWaMessages();
  } catch (e) {
    return NextResponse.json({ error: `evolution_fetch: ${(e as Error).message}` }, { status: 502 });
  }

  const todayMsj = allMsj.filter((m) => {
    const ts = m.messageTimestamp || 0;
    return ts >= tsStart && ts < tsEnd;
  });

  const result: SyncResult = {
    date: isoDate,
    total_msj_grupo: todayMsj.length,
    reports_parseados: 0,
    auto_cargados: [],
    pendientes_review: [],
    errores: [],
  };

  // Team para resolver closer_hint y Juanma cobrador
  const { data: team } = await sb
    .from("team_members")
    .select("id,nombre,is_closer,is_setter,is_cobranzas")
    .eq("activo", true);
  const teamList = (team || []) as TeamMember[];
  const teamByNombre = new Map<string, TeamMember>();
  for (const t of teamList) teamByNombre.set(t.nombre, t);
  const juanma = teamList.find((t) => t.nombre === "Juanma");

  // Dedup por wa_id (cada mensaje a veces se duplica por Valen+otro)
  const seenWaId = new Set<string>();
  for (const m of todayMsj) {
    const parsed = parseReport(m);
    if (!parsed) continue;
    if (seenWaId.has(parsed.wa_id)) continue;
    seenWaId.add(parsed.wa_id);
    result.reports_parseados++;

    if (!parsed.is_clear) {
      result.pendientes_review.push({
        wa_id: parsed.wa_id,
        fdt: parsed.fdt_art,
        cliente: parsed.cliente,
        razon: parsed.reason,
        texto_short: parsed.texto.slice(0, 100),
      });
      continue;
    }

    // ¿Ya cargado?
    try {
      if (await alreadyLoaded(sb, parsed.wa_id)) continue;
    } catch (e) {
      result.errores.push({ wa_id: parsed.wa_id, error: `dup_check: ${(e as Error).message}` });
      continue;
    }

    // Find lead
    let lead = parsed.cliente ? await findLeadByName(sb, parsed.cliente) : null;
    let closerId: string | null = lead?.closer_id || null;
    if (!closerId && parsed.closer_hint) {
      closerId = teamByNombre.get(parsed.closer_hint)?.id || null;
    }

    // Si no hay lead, crearlo
    let leadId: string;
    if (!lead) {
      const newLead = {
        nombre: parsed.cliente!,
        closer_id: closerId,
        estado: "cerrado",
        programa_pitcheado: parsed.programa,
        ticket_total: parsed.monto_usd || 0,
        fuente: "otro",
        nicho: "general",
        notas_internas: `[WA_MSG:${parsed.wa_id}] Lead auto-creado desde grupo PAGOS SECURE SCALE`,
        etiquetas: ["wa_auto"],
      };
      try {
        const { data, error } = await sb.from("leads").insert(newLead).select().single();
        if (error) throw error;
        leadId = (data as { id: string }).id;
      } catch (e) {
        result.errores.push({ wa_id: parsed.wa_id, error: `insert_lead: ${(e as Error).message}` });
        continue;
      }
    } else {
      leadId = lead.id;
      // Asegurarse de que esté cerrado si no lo estaba
      await sb
        .from("leads")
        .update({ estado: "cerrado", programa_pitcheado: parsed.programa || undefined })
        .eq("id", leadId);
    }

    // Crear payment
    const payment: Record<string, unknown> = {
      lead_id: leadId,
      monto_usd: parsed.monto_usd || 0,
      monto_ars: parsed.monto_ars || 0,
      fecha_pago: new Date(parsed.ts * 1000).toISOString(),
      numero_cuota: parsed.numero_cuota,
      es_renovacion: parsed.tipo === "renovacion",
      estado: "pagado",
      metodo_pago: "transferencia",
      verificado: false,
      notas: `[WA_MSG:${parsed.wa_id}] Auto-cargado desde grupo PAGOS SECURE SCALE`,
    };
    if (juanma) payment.cobrador_id = juanma.id;

    try {
      const { error } = await sb.from("payments").insert(payment);
      if (error) throw error;
      result.auto_cargados.push({
        wa_id: parsed.wa_id,
        cliente: parsed.cliente!,
        monto_usd: parsed.monto_usd,
        monto_ars: parsed.monto_ars,
        tipo: parsed.tipo,
      });
    } catch (e) {
      result.errores.push({ wa_id: parsed.wa_id, error: `insert_payment: ${(e as Error).message}` });
    }
  }

  return NextResponse.json(result);
}
