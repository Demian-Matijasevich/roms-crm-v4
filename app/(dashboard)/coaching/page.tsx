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

  const [closersRes, leadsRes, paymentsRes] = await Promise.all([
    sb.from("team_members").select("id, nombre, is_closer").eq("activo", true).eq("is_closer", true),
    sb
      .from("leads")
      .select("id, nombre, estado, fecha_llamada, fecha_cierre_estimada, closer_id, ticket_total, telefono")
      .range(0, 9999),
    sb
      .from("payments")
      .select("lead_id, monto_usd, fecha_pago, estado, numero_cuota, es_renovacion")
      .eq("estado", "pagado")
      .not("fecha_pago", "is", null)
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
    const cerradosMes = closerLeads.filter(
      (l) =>
        l.estado === "cerrado" &&
        l.fecha_llamada &&
        l.fecha_llamada.slice(0, 10) >= fiscalStart &&
        l.fecha_llamada.slice(0, 10) <= fiscalEnd
    );
    const leadIdsCloser = new Set(closerLeads.map((l) => l.id));
    const cashMes = payments
      .filter(
        (p) =>
          p.lead_id &&
          leadIdsCloser.has(p.lead_id) &&
          !p.es_renovacion &&
          p.fecha_pago &&
          p.fecha_pago >= fiscalStart &&
          p.fecha_pago <= fiscalEnd
      )
      .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const ticketTotalMes = cerradosMes.reduce((s, l) => s + Number(l.ticket_total || 0), 0);
    const ticketAvg = cerradosMes.length > 0 ? ticketTotalMes / cerradosMes.length : 0;
    const cierrePctDen = closerLeads.filter((l) => ["cerrado", "no_cierre", "reserva", "broke_cancelado"].includes(l.estado)).length;
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

  return (
    <CoachingClient
      snapshots={snapshots}
      alertas={alertas}
      session={session}
      fiscalStart={fiscalStart}
      fiscalEnd={fiscalEnd}
    />
  );
}
