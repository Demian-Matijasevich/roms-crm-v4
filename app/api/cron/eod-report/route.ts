/**
 * GET /api/cron/eod-report?token=XXX&date=YYYY-MM-DD&target=phone
 *
 * Genera el reporte EOD y envía un mensaje WhatsApp por closer (más un resumen
 * global al final). Cada mensaje muestra el detalle de cada llamada con su
 * estado, en formato lista discriminada.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

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
}

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
  // Si no_show explícito por se_presento=no y estado pendiente: forzar no_show
  if (l.se_presento === "no" && l.estado === "pendiente") return ESTADO_LABEL.no_show;
  if (l.se_presento === "cancelado") return ESTADO_LABEL.cancelada;
  return ESTADO_LABEL[l.estado] || `⚪ ${l.estado}`;
}

function f(n: number): string {
  return n.toLocaleString("en-US");
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
    const d = new Date(targetDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  // Rangos para matchear contra timestamps (las fechas en DB tienen hora)
  const dayStart = `${targetDate}T00:00:00`;
  const dayEndExclusive = `${tomorrow}T00:00:00`;
  const tomorrowEndExclusive = (() => {
    const d = new Date(tomorrow + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) + "T00:00:00";
  })();

  const sb = createServerClient();

  const { data: closers } = await sb
    .from("team_members")
    .select("id, nombre")
    .eq("activo", true)
    .eq("is_closer", true)
    .order("nombre");

  const { data: todayLeadsRaw } = await sb
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, se_presento, closer_id, ticket_total, programa_pitcheado")
    .or(`and(fecha_llamada.gte.${dayStart},fecha_llamada.lt.${dayEndExclusive}),and(fecha_agendado.gte.${dayStart},fecha_agendado.lt.${dayEndExclusive})`)
    .range(0, 9999);

  const todayLeads: LeadDia[] = (todayLeadsRaw || []) as LeadDia[];

  const { data: tomorrowLeads } = await sb
    .from("leads")
    .select("id, nombre, closer_id, fecha_agendado")
    .or(`and(fecha_llamada.gte.${dayEndExclusive},fecha_llamada.lt.${tomorrowEndExclusive}),and(fecha_agendado.gte.${dayEndExclusive},fecha_agendado.lt.${tomorrowEndExclusive})`)
    .range(0, 9999);

  const { data: payments } = await sb
    .from("payments")
    .select("monto_usd, lead_id, fecha_pago, estado, numero_cuota")
    .eq("fecha_pago", targetDate)
    .eq("estado", "pagado")
    .range(0, 999);

  // Comentarios del día por closer
  const { data: notes } = await sb
    .from("closer_daily_notes")
    .select("team_member_id, comentario")
    .eq("fecha", targetDate);
  const noteByMember = new Map<string, string>();
  for (const n of notes || []) {
    if (n.comentario && n.comentario.trim()) noteByMember.set(n.team_member_id, n.comentario.trim());
  }

  const cashByLead = new Map<string, number>();
  for (const p of payments || []) {
    if (!p.lead_id) continue;
    cashByLead.set(p.lead_id, (cashByLead.get(p.lead_id) || 0) + Number(p.monto_usd || 0));
  }

  const fechaLabel = new Date(targetDate + "T00:00:00").toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long",
  });
  const fechaCap = fechaLabel.charAt(0).toUpperCase() + fechaLabel.slice(1);

  // Mensajes a enviar: uno por closer + uno global al final
  const mensajes: Array<{ tipo: string; nombre: string; texto: string }> = [];

  // Stats globales mientras armamos por closer
  let globalAgendados = 0;
  let globalShow = 0;
  let globalCerrados = 0;
  let globalCash = 0;
  let globalManana = 0;

  for (const c of closers || []) {
    const míos = todayLeads.filter((l) => l.closer_id === c.id);
    if (míos.length === 0) continue;

    // Orden: cerrados primero, luego seguimiento, luego perdidos/no show, luego pendientes
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
    const mananaCloser = (tomorrowLeads || []).filter((l) => l.closer_id === c.id).length;

    globalAgendados += stats.agendados;
    globalShow += stats.show;
    globalCerrados += stats.cerrados;
    globalCash += cashCloser;
    globalManana += mananaCloser;

    // Armar mensaje del closer
    const lines: string[] = [
      `📊 *EOD ${c.nombre} — ${fechaCap}*`,
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
      if ((l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva")) {
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

    // Comentario del día (si lo cargó)
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

  // Huérfanos: leads del día sin closer asignado (iClosed bookea sin asignar
  // host; queda NULL hasta que se marca la call como HELD).
  const huerfanos = todayLeads.filter((l) => !l.closer_id);

  // Mensaje global al final
  const globalLines: string[] = [
    `📊 *EOD GLOBAL — ${fechaCap}*`,
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
    const closer = (closers || []).find((c) => c.nombre === m.nombre);
    if (!closer) continue;
    const míos = todayLeads.filter((l) => l.closer_id === closer.id);
    const cerrados = míos.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento" || l.estado === "reserva").length;
    const cash = míos.reduce((s, l) => s + (cashByLead.get(l.id) || 0), 0);
    globalLines.push(`• *${closer.nombre}*: ${míos.length} llamadas · ${cerrados} cerradas · $${f(Math.round(cash))} cash`);
  }

  // Bucket de huérfanos — visible para asignar manualmente en /cerrar-dia
  if (huerfanos.length > 0) {
    globalLines.push(``);
    globalLines.push(`━━━━━━━━━━━━━━━━━━━━`);
    globalLines.push(`🚨 *${huerfanos.length} llamada${huerfanos.length === 1 ? "" : "s"} sin closer asignado*`);
    globalLines.push(`_iClosed no mandó host. Hay que asignarlas manualmente._`);
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

  // Enviar via Evolution API — uno por mensaje
  const evolUrl = process.env.EVOLUTION_API_URL;
  const evolKey = process.env.EVOLUTION_API_KEY;
  const evolInstance = process.env.EVOLUTION_INSTANCE;
  const target = (url.searchParams.get("target") || process.env.EOD_TARGET_NUMBER || "").trim().replace(/^﻿/, "");

  const envios: Array<{ tipo: string; nombre: string; status: number | null; error: string | null }> = [];

  if (!evolUrl || !evolKey || !evolInstance) {
    envios.push({ tipo: "config", nombre: "—", status: null, error: "Evolution API no configurado" });
  } else if (!target) {
    envios.push({ tipo: "config", nombre: "—", status: null, error: "Falta EOD_TARGET_NUMBER" });
  } else {
    for (const m of mensajes) {
      try {
        const sendRes = await fetch(`${evolUrl}/message/sendText/${encodeURIComponent(evolInstance)}`, {
          method: "POST",
          headers: { apikey: evolKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: target, text: m.texto, delay: 1500 }),
        });
        let err: string | null = null;
        if (!sendRes.ok) {
          const txt = await sendRes.text().catch(() => "");
          err = `HTTP ${sendRes.status}: ${txt.slice(0, 150)}`;
        }
        envios.push({ tipo: m.tipo, nombre: m.nombre, status: sendRes.status, error: err });
        // Pequeña pausa entre mensajes para que WhatsApp no los junte y queden ordenados
        await new Promise((r) => setTimeout(r, 800));
      } catch (e) {
        envios.push({ tipo: m.tipo, nombre: m.nombre, status: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return NextResponse.json({
    ok: envios.every((e) => !e.error),
    date: targetDate,
    target,
    closers_con_actividad: mensajes.filter((m) => m.tipo === "closer").length,
    globalCerrados,
    globalCash,
    envios,
  });
}
