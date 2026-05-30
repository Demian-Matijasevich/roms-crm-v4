import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString, getToday } from "@/lib/date-utils";
import CoachingClient from "./CoachingClient";

export const dynamic = "force-dynamic";

export interface CoachingCloserSnapshot {
  id: string;
  nombre: string;
  total_activos: number;
  reservas: number;
  seguimientos: number;
  cerrados_mes: number;
  cash_mes_usd: number;
  ticket_total_mes: number;
  ticket_avg_mes: number;
  cierre_pct: number;
  ultima_llamada: string | null;
  reservas_vencidas: number;
  sin_movimiento_7d: number;
  // 025 — Secure Scale metrics
  agendas_mes: number;
  presentadas_mes: number;
  show_up_rate: number;
  show_up_rate_calificados: number;
  cierre_pct_calificados: number;
  cierre_pct_no_calificados: number;
  cerrados_en_llamada: number;
  cerrados_en_seguimiento: number;
  aov_dia_1: number;
  aov_trato_cerrado: number;
}

export interface CoachingLeadAlerta {
  id: string;
  nombre: string;
  closer_nombre: string | null;
  closer_id: string | null;
  estado: string;
  fecha_llamada: string | null;
  fecha_cierre_estimada: string | null;
  ticket_total: number;
  motivo: "reserva_vencida" | "sin_movimiento_7d" | "sin_movimiento_14d";
  dias: number;
}

export interface CoachingSetterFuente {
  setter_id: string;
  setter_nombre: string;
  fuente: string;
  conversaciones: number;
  fups: number;
  calendarios: number;
  agendas: number;
  agendas_calificadas: number;
  pct_calificados: number;
  msj_por_calendario: number;
  agenda_por_calendario: number;
}

export default async function CoachingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Solo admin o jefe de ventas
  const allowed = session.is_admin || session.is_jefe_ventas || session.roles.includes("jefe_ventas");
  if (!allowed) redirect("/");

  const sb = createServerClient();
  const todayStr = toDateString(getToday());
  const fiscalStart = toDateString(getFiscalStart(getToday()));
  const fiscalEnd = toDateString(getFiscalEnd(getToday()));

  const [closersRes, leadsRes, paymentsRes, settersRes, reportsRes] = await Promise.all([
    sb.from("team_members").select("id, nombre, is_closer").eq("activo", true).eq("is_closer", true),
    sb
      .from("leads")
      .select("id, nombre, estado, fecha_llamada, fecha_cierre_estimada, closer_id, ticket_total, telefono, se_presento, cerrado_en_llamada, lead_calificado")
      .range(0, 9999),
    sb
      .from("payments")
      .select("lead_id, monto_usd, fecha_pago, estado, numero_cuota, es_renovacion")
      .eq("estado", "pagado")
      .not("fecha_pago", "is", null)
      .range(0, 9999),
    sb.from("team_members").select("id, nombre").eq("activo", true).eq("is_setter", true),
    sb
      .from("daily_reports")
      .select("setter_id, fecha, conversaciones_iniciadas, calendarios_enviados, fups, agendas, agendas_calificadas, fuente")
      .gte("fecha", fiscalStart)
      .lte("fecha", fiscalEnd)
      .range(0, 9999),
  ]);

  const closers = (closersRes.data || []) as { id: string; nombre: string }[];
  const leads = (leadsRes.data || []) as Array<{
    id: string;
    nombre: string;
    estado: string;
    fecha_llamada: string | null;
    fecha_cierre_estimada: string | null;
    closer_id: string | null;
    ticket_total: number | null;
    telefono: string | null;
    se_presento?: "si" | "no" | "cancelado" | null;
    cerrado_en_llamada?: boolean | null;
    lead_calificado?: string | null;
  }>;
  const payments = (paymentsRes.data || []) as Array<{
    lead_id: string | null;
    monto_usd: number;
    fecha_pago: string | null;
    estado: string;
    numero_cuota: number;
    es_renovacion: boolean;
  }>;

  const closerById = new Map(closers.map((c) => [c.id, c]));

  function daysAgo(dateStr: string | null): number {
    if (!dateStr) return 999;
    const d = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.floor((now - d) / (1000 * 60 * 60 * 24));
  }

  // Snapshots por closer
  const snapshots: CoachingCloserSnapshot[] = closers.map((c) => {
    const closerLeads = leads.filter((l) => l.closer_id === c.id);
    const activos = closerLeads.filter((l) => ["pendiente", "seguimiento", "reserva", "no_show", "reprogramada", "no_calificado"].includes(l.estado));
    const reservas = closerLeads.filter((l) => l.estado === "reserva");
    const seguimientos = closerLeads.filter((l) => l.estado === "seguimiento");

    // Lead "del mes" = tuvo fecha_llamada en el periodo. Eso es lo que el closer trabajo este mes.
    const leadsMes = closerLeads.filter(
      (l) => l.fecha_llamada && l.fecha_llamada.slice(0, 10) >= fiscalStart && l.fecha_llamada.slice(0, 10) <= fiscalEnd
    );
    const cerradosMes = leadsMes.filter((l) => l.estado === "cerrado");

    const leadIdsCloser = new Set(closerLeads.map((l) => l.id));
    const paymentsMes = payments.filter(
      (p) =>
        p.lead_id &&
        leadIdsCloser.has(p.lead_id) &&
        !p.es_renovacion &&
        p.fecha_pago &&
        p.fecha_pago >= fiscalStart &&
        p.fecha_pago <= fiscalEnd
    );
    const cashMes = paymentsMes.reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const ticketTotalMes = cerradosMes.reduce((s, l) => s + Number(l.ticket_total || 0), 0);
    const ticketAvg = cerradosMes.length > 0 ? ticketTotalMes / cerradosMes.length : 0;
    const cierrePctDen = leadsMes.filter((l) => ["cerrado", "no_cierre", "reserva", "broke_cancelado"].includes(l.estado)).length;
    const cierrePct = cierrePctDen > 0 ? (cerradosMes.length / cierrePctDen) * 100 : 0;
    const ultimaLlamada = closerLeads.reduce<string | null>((max, l) => {
      if (!l.fecha_llamada) return max;
      if (!max || l.fecha_llamada > max) return l.fecha_llamada;
      return max;
    }, null);
    const reservasVencidas = reservas.filter(
      (l) => l.fecha_cierre_estimada && l.fecha_cierre_estimada < todayStr
    ).length;
    const sinMovimiento7d = activos.filter((l) => daysAgo(l.fecha_llamada) >= 7).length;

    // 025 — Show up rate
    const agendasMes = leadsMes.length;
    const presentadasMes = leadsMes.filter((l) => l.se_presento === "si").length;
    const calificadosMes = leadsMes.filter((l) => l.lead_calificado === "calificado");
    const noCalificadosMes = leadsMes.filter((l) => l.lead_calificado === "no_calificado");
    const presentadasCalif = calificadosMes.filter((l) => l.se_presento === "si").length;
    const showUpRate = agendasMes > 0 ? (presentadasMes / agendasMes) * 100 : 0;
    const showUpRateCalif = calificadosMes.length > 0 ? (presentadasCalif / calificadosMes.length) * 100 : 0;

    // % de cierre por calificación (sobre presentadas, igual que Secure Scale)
    const cerradosCalif = cerradosMes.filter((l) => l.lead_calificado === "calificado").length;
    const cerradosNoCalif = cerradosMes.filter((l) => l.lead_calificado === "no_calificado").length;
    const cierrePctCalif = presentadasCalif > 0 ? (cerradosCalif / presentadasCalif) * 100 : 0;
    const presentadasNoCalif = noCalificadosMes.filter((l) => l.se_presento === "si").length;
    const cierrePctNoCalif = presentadasNoCalif > 0 ? (cerradosNoCalif / presentadasNoCalif) * 100 : 0;

    // Cerrado en llamada vs en seguimiento
    const cerradosEnLlamada = cerradosMes.filter((l) => l.cerrado_en_llamada === true).length;
    const cerradosEnSeguimiento = cerradosMes.filter((l) => l.cerrado_en_llamada === false).length;

    // AOV Día 1 vs Trato Cerrado
    const cerradoMesIds = new Set(cerradosMes.map((l) => l.id));
    const c1Pagos = payments.filter((p) => p.lead_id && cerradoMesIds.has(p.lead_id) && p.numero_cuota === 1);
    const totalCash = c1Pagos.reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const aovDia1 = cerradosMes.length > 0 ? totalCash / cerradosMes.length : 0;
    const aovTrato = cerradosMes.length > 0 ? ticketTotalMes / cerradosMes.length : 0;

    return {
      id: c.id,
      nombre: c.nombre,
      total_activos: activos.length,
      reservas: reservas.length,
      seguimientos: seguimientos.length,
      cerrados_mes: cerradosMes.length,
      cash_mes_usd: Math.round(cashMes),
      ticket_total_mes: Math.round(ticketTotalMes),
      ticket_avg_mes: Math.round(ticketAvg),
      cierre_pct: Math.round(cierrePct),
      ultima_llamada: ultimaLlamada,
      reservas_vencidas: reservasVencidas,
      sin_movimiento_7d: sinMovimiento7d,
      agendas_mes: agendasMes,
      presentadas_mes: presentadasMes,
      show_up_rate: Math.round(showUpRate),
      show_up_rate_calificados: Math.round(showUpRateCalif),
      cierre_pct_calificados: Math.round(cierrePctCalif),
      cierre_pct_no_calificados: Math.round(cierrePctNoCalif),
      cerrados_en_llamada: cerradosEnLlamada,
      cerrados_en_seguimiento: cerradosEnSeguimiento,
      aov_dia_1: Math.round(aovDia1),
      aov_trato_cerrado: Math.round(aovTrato),
    };
  });

  // Alertas — leads que requieren acción
  const alertas: CoachingLeadAlerta[] = [];
  for (const l of leads) {
    if (!l.closer_id) continue;
    const closer = closerById.get(l.closer_id);
    if (!closer) continue;

    if (l.estado === "reserva" && l.fecha_cierre_estimada && l.fecha_cierre_estimada < todayStr) {
      alertas.push({
        id: l.id,
        nombre: l.nombre,
        closer_nombre: closer.nombre,
        closer_id: l.closer_id,
        estado: l.estado,
        fecha_llamada: l.fecha_llamada,
        fecha_cierre_estimada: l.fecha_cierre_estimada,
        ticket_total: l.ticket_total || 0,
        motivo: "reserva_vencida",
        dias: daysAgo(l.fecha_cierre_estimada),
      });
    } else if (
      ["seguimiento", "reserva", "no_show", "reprogramada"].includes(l.estado) &&
      l.fecha_llamada &&
      daysAgo(l.fecha_llamada) >= 14
    ) {
      alertas.push({
        id: l.id,
        nombre: l.nombre,
        closer_nombre: closer.nombre,
        closer_id: l.closer_id,
        estado: l.estado,
        fecha_llamada: l.fecha_llamada,
        fecha_cierre_estimada: l.fecha_cierre_estimada,
        ticket_total: l.ticket_total || 0,
        motivo: "sin_movimiento_14d",
        dias: daysAgo(l.fecha_llamada),
      });
    } else if (
      ["seguimiento", "reserva", "no_show", "reprogramada"].includes(l.estado) &&
      l.fecha_llamada &&
      daysAgo(l.fecha_llamada) >= 7
    ) {
      alertas.push({
        id: l.id,
        nombre: l.nombre,
        closer_nombre: closer.nombre,
        closer_id: l.closer_id,
        estado: l.estado,
        fecha_llamada: l.fecha_llamada,
        fecha_cierre_estimada: l.fecha_cierre_estimada,
        ticket_total: l.ticket_total || 0,
        motivo: "sin_movimiento_7d",
        dias: daysAgo(l.fecha_llamada),
      });
    }
  }

  alertas.sort((a, b) => b.dias - a.dias);
  snapshots.sort((a, b) => b.cash_mes_usd - a.cash_mes_usd);

  // 025 — Métricas de setters por fuente
  const setters = (settersRes.data || []) as { id: string; nombre: string }[];
  const reports = (reportsRes.data || []) as Array<{
    setter_id: string;
    fecha: string;
    conversaciones_iniciadas: number;
    calendarios_enviados: number;
    fups: number;
    agendas: number;
    agendas_calificadas: number;
    fuente: string | null;
  }>;
  const setterFuenteMap = new Map<string, CoachingSetterFuente>();
  for (const r of reports) {
    const setter = setters.find((s) => s.id === r.setter_id);
    if (!setter) continue;
    const fuente = r.fuente || "todas";
    const key = `${r.setter_id}::${fuente}`;
    if (!setterFuenteMap.has(key)) {
      setterFuenteMap.set(key, {
        setter_id: r.setter_id,
        setter_nombre: setter.nombre,
        fuente,
        conversaciones: 0,
        fups: 0,
        calendarios: 0,
        agendas: 0,
        agendas_calificadas: 0,
        pct_calificados: 0,
        msj_por_calendario: 0,
        agenda_por_calendario: 0,
      });
    }
    const acc = setterFuenteMap.get(key)!;
    acc.conversaciones += Number(r.conversaciones_iniciadas || 0);
    acc.fups += Number(r.fups || 0);
    acc.calendarios += Number(r.calendarios_enviados || 0);
    acc.agendas += Number(r.agendas || 0);
    acc.agendas_calificadas += Number(r.agendas_calificadas || 0);
  }
  const setterFuente: CoachingSetterFuente[] = [...setterFuenteMap.values()].map((m) => ({
    ...m,
    pct_calificados: m.agendas > 0 ? Math.round((m.agendas_calificadas / m.agendas) * 100) : 0,
    msj_por_calendario: m.calendarios > 0 ? Math.round(m.conversaciones / m.calendarios) : 0,
    agenda_por_calendario: m.calendarios > 0 ? Math.round((m.agendas / m.calendarios) * 100) : 0,
  }));
  setterFuente.sort((a, b) => b.agendas - a.agendas);

  return (
    <CoachingClient
      snapshots={snapshots}
      alertas={alertas}
      setterFuente={setterFuente}
      session={session}
      fiscalStart={fiscalStart}
      fiscalEnd={fiscalEnd}
    />
  );
}
