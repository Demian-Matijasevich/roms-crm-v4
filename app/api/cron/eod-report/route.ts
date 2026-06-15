/**
 * GET /api/cron/eod-report?token=XXX&date=YYYY-MM-DD&target=phone&nicho=general|politica
 *
 * Genera el reporte EOD y envía mensajes WhatsApp:
 *   - Un mensaje por closer con actividad del día (detalle de llamadas).
 *   - Un resumen global al final.
 *   - Separado por nicho (general / política), cada uno a su target WA.
 *
 * Sin ?nicho= → procesa ambos nichos (2 ciclos).
 * Targets:
 *   - general:  EOD_TARGET_NUMBER (env) o ?target=
 *   - politica: EOD_TARGET_NUMBER_POLITICA (env) o ?target_politica=
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface LeadDia {
  id: string;
  nombre: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: string;
  se_presento: string | null;
  closer_id: string | null;
  ticket_total: number | null;
  programa_pitcheado: string | null;
  nicho: string | null;
}

interface PaymentDia {
  monto_usd: number | null;
  lead_id: string | null;
  fecha_pago: string | null;
  estado: string;
  numero_cuota: number | null;
}

interface CloserRow { id: string; nombre: string }

const ESTADO_LABEL: Record<string, string> = {
  cerrado: "💰 Cerrado",
  adentro_seguimiento: "💰 Cerrado (cobro en seg.)",
  reserva: "📌 Reserva",
  seguimiento: "⏰ Seguimiento",
  no_cierre: "🚫 No cierre",
  no_calificado: "🚫 No calificó",
  broke_cancelado: "🚫 No tenía plata",
  no_show: "❌ No show",
  cancelada: "❌ Canceló",
  reprogramada: "📅 Reprogramada",
  pendiente: "⚠️ Sin marcar",
};

function labelEstado(l: LeadDia): string {
  if (l.se_presento === "no" && l.estado === "pendiente") return ESTADO_LABEL.no_show;
  if (l.se_presento === "cancelado") return ESTADO_LABEL.cancelada;
  return ESTADO_LABEL[l.estado] || `⚪ ${l.estado}`;
}

function f(n: number): string {
  return n.toLocaleString("en-US");
}

type BuildArgs = {
  nichoLabel: string;            // "general" / "politica" — para banner
  nichoEmoji: string;            // "📊" / "🏛"
  todayLeads: LeadDia[];
  tomorrowLeads: Array<{ id: string; nombre: string | null; closer_id: string | null; fecha_agendado: string | null }>;
  cashByLead: Map<string, number>;
  closers: CloserRow[];
  noteByMember: Map<string, string>;
  fechaCap: string;
};

function buildMessages(args: BuildArgs): Array<{ tipo: string; nombre: string; texto: string }> {
  const { nichoLabel, nichoEmoji, todayLeads, tomorrowLeads, cashByLead, closers, noteByMember, fechaCap } = args;
  const mensajes: Array<{ tipo: string; nombre: string; texto: string }> = [];

  let globalAgendados = 0;
  let globalShow = 0;
  let globalCerrados = 0;
  let globalCash = 0;
  let globalManana = 0;

  for (const c of closers) {
    const míos = todayLeads.filter((l) => l.closer_id === c.id);
    if (míos.length === 0) continue;

    const orden: Record<string, number> = {
      cerrado: 1, adentro_seguimiento: 1, reserva: 2,
      seguimiento: 3,
      no_cierre: 4, no_calificado: 4, broke_cancelado: 4,
      no_show: 5, cancelada: 5,
      reprogramada: 6,
      pendiente: 7,
    };
    míos.sort((a, b) => (orden[a.estado] || 9) - (orden[b.estado] || 9));

    const stats = {
      agendados: míos.length,
      show: míos.filter((l) => l.se_presento === "si").length,
      noShow: míos.filter((l) => l.estado === "no_show" || (l.se_presento === "no" && l.estado === "pendiente")).length,
      cerrados: míos.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva").length,
      seguimiento: míos.filter((l) => l.estado === "seguimiento").length,
      no_cierre: míos.filter((l) => l.estado === "no_cierre" || l.estado === "no_calificado" || l.estado === "broke_cancelado").length,
      pendientes: míos.filter((l) => l.estado === "pendiente" && l.se_presento !== "no").length,
    };

    const cashCloser = míos.reduce((s, l) => s + (cashByLead.get(l.id) || 0), 0);
    const mananaCloser = tomorrowLeads.filter((l) => l.closer_id === c.id).length;

    globalAgendados += stats.agendados;
    globalShow += stats.show;
    globalCerrados += stats.cerrados;
    globalCash += cashCloser;
    globalManana += mananaCloser;

    const lines: string[] = [
      `${nichoEmoji} *EOD ${nichoLabel.toUpperCase()} · ${c.nombre} — ${fechaCap}*`,
      ``,
      `🎯 *Resumen*`,
      `• Llamadas: ${stats.agendados}`,
      `• Show ups: ${stats.show}/${stats.agendados}${stats.agendados ? ` (${Math.round((stats.show / stats.agendados) * 100)}%)` : ""}`,
      `• Cerrados: ${stats.cerrados}`,
      `• Cash collected: $${f(Math.round(cashCloser))}`,
      mananaCloser > 0 ? `• Mañana: ${mananaCloser} agenda${mananaCloser === 1 ? "" : "s"}` : "",
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*📋 Detalle por llamada*`,
    ];

    for (const l of míos) {
      const estado = labelEstado(l);
      const nombre = (l.nombre || "—").slice(0, 35);
      let extra = "";
      const cash = cashByLead.get(l.id) || 0;
      if (l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva") {
        const tic = Number(l.ticket_total || 0);
        if (tic > 0) extra += ` ${l.programa_pitcheado || ""} $${f(tic)}`;
        if (cash > 0) extra += ` (cobró $${f(Math.round(cash))})`;
      }
      lines.push(`• ${nombre} — ${estado}${extra}`);
    }

    if (stats.pendientes > 0) {
      lines.push("");
      lines.push(`⚠️ Tenés ${stats.pendientes} llamada${stats.pendientes === 1 ? "" : "s"} sin marcar. Cargá en /cerrar-dia.`);
    }

    const nota = noteByMember.get(c.id);
    if (nota) {
      lines.push("");
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`*📝 Comentario del día*`);
      lines.push(nota);
    }

    lines.push("");
    lines.push("🤖 ROMS CRM");

    mensajes.push({ tipo: "closer", nombre: c.nombre, texto: lines.join("\n") });
  }

  // Huerfanos del nicho
  const huerfanos = todayLeads.filter((l) => !l.closer_id);

  const globalLines: string[] = [
    `${nichoEmoji} *EOD GLOBAL · ${nichoLabel.toUpperCase()} — ${fechaCap}*`,
    ``,
    `🎯 *Resumen del equipo*`,
    `• Agendadas: ${globalAgendados}${huerfanos.length ? ` (+${huerfanos.length} sin asignar)` : ""}`,
    `• Show ups: ${globalShow}/${globalAgendados}${globalAgendados ? ` (${Math.round((globalShow / globalAgendados) * 100)}%)` : ""}`,
    `• Cerrados: ${globalCerrados}`,
    `• Cash collected: $${f(Math.round(globalCash))}`,
    `• Para mañana: ${globalManana} agendas`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `*👥 Por closer*`,
  ];
  for (const m of mensajes) {
    const closer = closers.find((c) => c.nombre === m.nombre);
    if (!closer) continue;
    const míos = todayLeads.filter((l) => l.closer_id === closer.id);
    const cerrados = míos.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva").length;
    const cash = míos.reduce((s, l) => s + (cashByLead.get(l.id) || 0), 0);
    globalLines.push(`• *${closer.nombre}*: ${míos.length} llamadas · ${cerrados} cerradas · $${f(Math.round(cash))} cash`);
  }

  if (huerfanos.length > 0) {
    globalLines.push(``);
    globalLines.push(`━━━━━━━━━━━━━━━━━━━━`);
    globalLines.push(`🚨 *${huerfanos.length} llamada${huerfanos.length === 1 ? "" : "s"} sin closer asignado*`);
    globalLines.push(`_Hay que asignarlas manualmente._`);
    for (const l of huerfanos) {
      const hora = (l.fecha_agendado || l.fecha_llamada || "").slice(11, 16);
      const nombre = (l.nombre || "—").slice(0, 35);
      globalLines.push(`• ${hora ? `${hora} — ` : ""}${nombre}`);
    }
    globalLines.push(``);
    globalLines.push(`Asignar: https://crm.backstagge.com/cerrar-dia`);
  }

  if (mensajes.length === 0 && huerfanos.length === 0) {
    globalLines.push("");
    globalLines.push("_Sin llamadas registradas hoy._");
  }
  globalLines.push("");
  globalLines.push("🤖 ROMS CRM");

  mensajes.push({ tipo: "global", nombre: "GLOBAL", texto: globalLines.join("\n") });

  return mensajes;
}

async function sendWA(opts: { evolUrl: string; evolKey: string; evolInstance: string; target: string; mensajes: Array<{ tipo: string; nombre: string; texto: string }> }) {
  const envios: Array<{ tipo: string; nombre: string; status: number | null; error: string | null }> = [];
  for (const m of opts.mensajes) {
    try {
      const sendRes = await fetch(`${opts.evolUrl}/message/sendText/${encodeURIComponent(opts.evolInstance)}`, {
        method: "POST",
        headers: { apikey: opts.evolKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: opts.target, text: m.texto, delay: 1500 }),
      });
      let err: string | null = null;
      if (!sendRes.ok) {
        const txt = await sendRes.text().catch(() => "");
        err = `HTTP ${sendRes.status}: ${txt.slice(0, 150)}`;
      }
      envios.push({ tipo: m.tipo, nombre: m.nombre, status: sendRes.status, error: err });
      await new Promise((r) => setTimeout(r, 800));
    } catch (e) {
      envios.push({ tipo: m.tipo, nombre: m.nombre, status: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return envios;
}

async function processNicho(opts: {
  sb: SupabaseClient;
  nicho: "general" | "politica";
  targetDate: string;
  dayStart: string;
  dayEndExclusive: string;
  tomorrowEndExclusive: string;
  fechaCap: string;
  evol: { url: string; key: string; instance: string } | null;
  target: string;
}) {
  const { sb, nicho, targetDate, dayStart, dayEndExclusive, tomorrowEndExclusive, fechaCap, evol, target } = opts;

  const { data: closers } = await sb
    .from("team_members")
    .select("id, nombre")
    .eq("activo", true)
    .eq("is_closer", true)
    .order("nombre");

  const { data: todayLeadsRaw } = await sb
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, se_presento, closer_id, ticket_total, programa_pitcheado, nicho")
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`)
    .eq("nicho", nicho)
    .range(0, 9999);

  const todayLeads = (todayLeadsRaw || []) as LeadDia[];

  const { data: tomorrowLeadsRaw } = await sb
    .from("leads")
    .select("id, nombre, closer_id, fecha_agendado, nicho")
    .or(`and(fecha_llamada.gte.${dayEndExclusive},fecha_llamada.lt.${tomorrowEndExclusive}),and(fecha_agendado.gte.${dayEndExclusive},fecha_agendado.lt.${tomorrowEndExclusive})`)
    .eq("nicho", nicho)
    .range(0, 9999);
  const tomorrowLeads = (tomorrowLeadsRaw || []) as Array<{ id: string; nombre: string | null; closer_id: string | null; fecha_agendado: string | null }>;

  // payments del día — filtrar por leads del nicho (post-fetch)
  const todayLeadIds = new Set(todayLeads.map((l) => l.id));
  const { data: paymentsRaw } = await sb
    .from("payments")
    .select("monto_usd, lead_id, fecha_pago, estado, numero_cuota")
    .eq("fecha_pago", targetDate)
    .eq("estado", "pagado")
    .range(0, 999);
  const payments = (paymentsRaw || []).filter((p) => p.lead_id && todayLeadIds.has(p.lead_id)) as PaymentDia[];

  const cashByLead = new Map<string, number>();
  for (const p of payments) {
    if (!p.lead_id) continue;
    cashByLead.set(p.lead_id, (cashByLead.get(p.lead_id) || 0) + Number(p.monto_usd || 0));
  }

  // Comentarios del día por closer (no se segrega por nicho — son del día del closer)
  const closersDelNicho = (closers || []).filter((c) => todayLeads.some((l) => l.closer_id === c.id));
  const { data: notes } = closersDelNicho.length > 0
    ? await sb
        .from("closer_daily_notes")
        .select("team_member_id, comentario")
        .eq("fecha", targetDate)
        .in("team_member_id", closersDelNicho.map((c) => c.id))
    : { data: [] };
  const noteByMember = new Map<string, string>();
  for (const n of notes || []) {
    if (n.comentario && n.comentario.trim()) noteByMember.set(n.team_member_id, n.comentario.trim());
  }

  const mensajes = buildMessages({
    nichoLabel: nicho === "politica" ? "Política" : "ROMS",
    nichoEmoji: nicho === "politica" ? "🏛" : "📊",
    todayLeads,
    tomorrowLeads,
    cashByLead,
    closers: closers || [],
    noteByMember,
    fechaCap,
  });

  // Envío
  if (!evol) {
    return { nicho, mensajes, envios: [{ tipo: "config", nombre: "—", status: null, error: "Evolution no configurado" }] };
  }
  if (!target) {
    return { nicho, mensajes, envios: [{ tipo: "config", nombre: "—", status: null, error: `Falta target WA para ${nicho}` }] };
  }
  const envios = await sendWA({ evolUrl: evol.url, evolKey: evol.key, evolInstance: evol.instance, target, mensajes });
  return { nicho, mensajes, envios };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const expectedToken = process.env.EOD_CRON_TOKEN || "";
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const targetDate = url.searchParams.get("date") || (() => {
    const now = new Date();
    const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    return sp.toISOString().slice(0, 10);
  })();

  const tomorrow = (() => {
    const d = new Date(targetDate + "T12:00:00-03:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const dayStart = `${targetDate}T00:00:00-03:00`;
  const dayEndExclusive = `${tomorrow}T00:00:00-03:00`;
  const tomorrowEndExclusive = (() => {
    const d = new Date(tomorrow + "T12:00:00-03:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) + "T00:00:00-03:00";
  })();

  const fechaLabel = new Date(targetDate + "T00:00:00").toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long",
  });
  const fechaCap = fechaLabel.charAt(0).toUpperCase() + fechaLabel.slice(1);

  const sb = createServerClient();

  const evolUrl = process.env.EVOLUTION_API_URL;
  const evolKey = process.env.EVOLUTION_API_KEY;
  const evolInstance = process.env.EVOLUTION_INSTANCE;
  const evol = evolUrl && evolKey && evolInstance
    ? { url: evolUrl, key: evolKey, instance: evolInstance }
    : null;

  // ¿Qué nichos procesar? ?nicho=politica|general → solo ese. Sin param → ambos.
  const requestedNicho = url.searchParams.get("nicho");
  const nichosAProcesar: Array<"general" | "politica"> = requestedNicho === "politica" || requestedNicho === "general"
    ? [requestedNicho]
    : ["general", "politica"];

  const targetGeneral = (url.searchParams.get("target") || process.env.EOD_TARGET_NUMBER || "").trim().replace(/^﻿/, "");
  const targetPolitica = (url.searchParams.get("target_politica") || process.env.EOD_TARGET_NUMBER_POLITICA || "").trim().replace(/^﻿/, "");

  const resultados = [];
  for (const nicho of nichosAProcesar) {
    const target = nicho === "politica" ? targetPolitica : targetGeneral;
    const r = await processNicho({
      sb,
      nicho,
      targetDate,
      dayStart,
      dayEndExclusive,
      tomorrowEndExclusive,
      fechaCap,
      evol,
      target,
    });
    resultados.push(r);
  }

  return NextResponse.json({
    ok: resultados.every((r) => r.envios.every((e) => !e.error)),
    date: targetDate,
    nichos: resultados.map((r) => ({
      nicho: r.nicho,
      mensajes_count: r.mensajes.length,
      envios: r.envios,
    })),
  });
}
