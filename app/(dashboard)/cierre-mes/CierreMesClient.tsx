"use client";

import { useState, useMemo } from "react";
import { computeTeamCommissions, computeValenCommission } from "@/lib/commissions";

interface Lead { id: string; nombre: string; programa_pitcheado: string | null; ticket_total: number; estado: string | null; fecha_llamada: string | null; fecha_agendado: string | null; closer_id: string | null; setter_id: string | null; utm_medium: string | null; utm_source: string | null; plan_pago: string | null; lead_calificado: string | null }
interface Payment { id: string; lead_id: string | null; monto_usd: number; monto_ars: number; fecha_pago: string | null; fecha_vencimiento: string | null; estado: string; numero_cuota: number; metodo_pago: string | null; receptor: string | null; es_renovacion: boolean }
interface Client { id: string; lead_id: string | null; nombre: string; programa: string | null; fecha_onboarding: string | null; fecha_offboarding: string | null; total_dias_programa: number; estado: string }
interface RenewalRow { id: string; client_id: string; tipo_renovacion: string | null; programa_anterior: string | null; programa_nuevo: string | null; monto_total: number; plan_pago: string | null; estado: string | null; fecha_renovacion: string | null; client?: { nombre: string; programa: string | null } | null }
interface Gasto { id: string; fecha: string; concepto: string; categoria: string; billetera: string; monto_usd: number; monto_ars: number; usd_rate_aplicado: number | null; estado: string; pagado_por: string | null; pagado_a: string | null }
interface TeamMember { id: string; nombre: string; is_closer: boolean; is_setter: boolean }
interface Campaign { medium: string | null; setter_id: string | null }

interface Props {
  leads: Lead[];
  payments: Payment[];
  clients: Client[];
  renewals: RenewalRow[];
  gastos: Gasto[];
  team: TeamMember[];
  campaigns: Campaign[];
  rates: Array<{ mes: string; rate: number }>;
  usdRate: number;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function programaKey(p: string | null): "omnipresencia" | "multicuentas" | "consultoria" | "roms_7" | "otros" {
  const x = (p || "").toLowerCase();
  if (x.includes("multi")) return "multicuentas";
  if (x.includes("consult")) return "consultoria";
  if (x.includes("omni")) return "omnipresencia";
  if (x === "roms_7" || x.includes("roms_7")) return "roms_7";
  return "otros";
}

const PROGRAMA_LABELS: Record<string, string> = {
  omnipresencia: "Omnipresencia", multicuentas: "Multicuentas",
  consultoria: "Consultoría", roms_7: "ROMS 7", otros: "Otros",
};

export default function CierreMesClient({ leads, payments, clients, renewals, gastos, team, campaigns, rates, usdRate }: Props) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  const monthRange = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const start = `${selectedMonth}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
    return { start, end, y, m, lastDay };
  }, [selectedMonth]);

  const prevRange = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const pmStr = `${py}-${String(pm).padStart(2, "0")}`;
    const lastDay = new Date(py, pm, 0).getDate();
    return { start: `${pmStr}-01`, end: `${pmStr}-${String(lastDay).padStart(2, "0")}`, label: pmStr };
  }, [selectedMonth]);

  const teamById = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);
  const programaByLead = useMemo(() => new Map(leads.map((l) => [l.id, l.programa_pitcheado])), [leads]);
  const ticketByLead = useMemo(() => new Map(leads.map((l) => [l.id, l.ticket_total || 0])), [leads]);
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  // ── Cómputo del mes seleccionado y mes anterior ──
  function computeForRange(start: string, end: string) {
    const initBucket = () => ({ omnipresencia: 0, multicuentas: 0, consultoria: 0, roms_7: 0, otros: 0, total: 0 });
    const ventas = initBucket();
    const cash = initBucket();
    const revenue = initBucket();

    // Facturación = suma del ticket_total cuando la cuota#1 del lead se pagó en el mes
    // (criterio contable: la venta se concretó cuando arrancó a cobrarse)
    const ventasDetalle: Lead[] = [];
    const leadsContabilizadosVentas = new Set<string>();
    for (const p of payments) {
      if (p.estado !== "pagado") continue;
      if (!p.lead_id || !p.fecha_pago) continue;
      const f = p.fecha_pago.split("T")[0];
      if (f < start || f > end) continue;
      if (p.numero_cuota !== 1) continue;
      if (leadsContabilizadosVentas.has(p.lead_id)) continue;
      const lead = leadById.get(p.lead_id);
      if (!lead) continue;
      const ticket = lead.ticket_total || 0;
      if (ticket <= 0) continue;
      leadsContabilizadosVentas.add(p.lead_id);
      const k = programaKey(lead.programa_pitcheado);
      ventas[k] += ticket;
      ventas.total += ticket;
      ventasDetalle.push(lead);
    }

    // Cash collected
    const paymentsInRange = payments.filter((p) => p.estado === "pagado" && p.fecha_pago && p.fecha_pago.split("T")[0] >= start && p.fecha_pago.split("T")[0] <= end);
    for (const p of paymentsInRange) {
      const programa = p.lead_id ? programaByLead.get(p.lead_id) : null;
      const k = programaKey(programa || null);
      cash[k] += p.monto_usd || 0;
      cash.total += p.monto_usd || 0;
    }

    // Revenue devengado
    const DAY = 86400000;
    const monthStartT = new Date(start).getTime();
    const monthEndT = new Date(end).getTime();
    for (const c of clients) {
      if (!c.fecha_onboarding || !c.lead_id) continue;
      const ticket = ticketByLead.get(c.lead_id) || 0;
      if (ticket <= 0) continue;
      const onb = new Date(c.fecha_onboarding.split("T")[0]).getTime();
      const programEnd = c.fecha_offboarding
        ? new Date(c.fecha_offboarding.split("T")[0]).getTime()
        : onb + (c.total_dias_programa || 90) * DAY;
      const overlapStart = Math.max(onb, monthStartT);
      const overlapEnd = Math.min(programEnd, monthEndT);
      if (overlapEnd < overlapStart) continue;
      const overlapDays = Math.floor((overlapEnd - overlapStart) / DAY) + 1;
      const totalDays = c.total_dias_programa || 90;
      const monthRev = (overlapDays / totalDays) * ticket;
      const k = programaKey(c.programa);
      revenue[k] += monthRev;
      revenue.total += monthRev;
    }

    return { ventas, cash, revenue, paymentsInRange, ventasDetalle };
  }

  const cur = useMemo(() => computeForRange(monthRange.start, monthRange.end), [monthRange]);
  const prev = useMemo(() => computeForRange(prevRange.start, prevRange.end), [prevRange]);

  // ── Closers performance ──
  const closersStats = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; agendas: number; presentadas: number; calificadas: number; cerradas: number; canceladas: number; pendientes: number; noShow: number; cash: number; comision: number; pays: { monto_usd: number; programa: string | null }[] }>();
    for (const t of team) if (t.is_closer) map.set(t.id, { id: t.id, nombre: t.nombre, agendas: 0, presentadas: 0, calificadas: 0, cerradas: 0, canceladas: 0, pendientes: 0, noShow: 0, cash: 0, comision: 0, pays: [] });

    const ESTADOS_NO_AGENDA = ["cancelada", "reprogramada", "broke_cancelado"];

    // Agendas (leads con fecha_llamada en mes)
    for (const l of leads) {
      if (!l.closer_id || !l.fecha_llamada) continue;
      const f = l.fecha_llamada.split("T")[0];
      if (f < monthRange.start || f > monthRange.end) continue;
      const entry = map.get(l.closer_id);
      if (!entry) continue;
      const estado = l.estado || "";
      // Cancelaciones (no cuentan como agenda)
      if (ESTADOS_NO_AGENDA.includes(estado)) {
        entry.canceladas++;
        continue;
      }
      entry.agendas++;
      if (estado === "no_show") entry.noShow++;
      else if (estado === "pendiente") entry.pendientes++;
      const presentada = !["pendiente", "no_show"].includes(estado);
      if (presentada) entry.presentadas++;
      if (l.lead_calificado === "calificado") entry.calificadas++;
      if (estado === "cerrado" || estado === "adentro_seguimiento") entry.cerradas++;
    }

    // Cash + comisión
    for (const p of cur.paymentsInRange) {
      if (!p.lead_id) continue;
      const lead = leadById.get(p.lead_id);
      if (!lead || !lead.closer_id) continue;
      const entry = map.get(lead.closer_id);
      if (!entry) continue;
      entry.cash += p.monto_usd || 0;
      entry.pays.push({ monto_usd: p.monto_usd, programa: lead.programa_pitcheado });
    }
    for (const e of map.values()) {
      if (e.cash > 0) e.comision = computeValenCommission(e.pays, e.cash).total;
    }
    return Array.from(map.values()).filter((e) => e.agendas > 0 || e.cash > 0).sort((a, b) => b.cash - a.cash);
  }, [leads, team, cur.paymentsInRange, leadById, monthRange]);

  // ── Setters performance (out / in / landing) ──
  const settersStats = useMemo(() => {
    const mediumToSetter = new Map<string, string>();
    for (const c of campaigns) if (c.setter_id && c.medium) mediumToSetter.set(c.medium.toLowerCase().trim(), c.setter_id);
    function resolve(l: Lead): { sid: string | null; via: "direct" | "utm" | "landing" } {
      if (l.utm_medium) {
        const sid = mediumToSetter.get(l.utm_medium.toLowerCase().trim());
        if (sid) return { sid, via: "utm" };
      }
      if (l.setter_id) return { sid: l.setter_id, via: "direct" };
      return { sid: null, via: "landing" };
    }
    const map = new Map<string, { id: string; nombre: string; outbound: number; inbound: number; total: number; cerradas: number; cash: number; comision: number }>();
    for (const t of team) if (t.is_setter) map.set(t.id, { id: t.id, nombre: t.nombre, outbound: 0, inbound: 0, total: 0, cerradas: 0, cash: 0, comision: 0 });
    let landing = 0;

    for (const l of leads) {
      const f = l.fecha_agendado?.split("T")[0] || l.fecha_llamada?.split("T")[0];
      if (!f || f < monthRange.start || f > monthRange.end) continue;
      if (l.estado === "cancelada" || l.estado === "reprogramada") continue;
      const r = resolve(l);
      if (r.via === "landing") { landing++; continue; }
      const e = r.sid ? map.get(r.sid) : null;
      if (!e) continue;
      e.total++;
      if (r.via === "direct") e.outbound++;
      else e.inbound++;
      if (l.estado === "cerrado" || l.estado === "adentro_seguimiento") e.cerradas++;
    }

    // Cash + comisión 3% (sobre pagos cuyo lead.setter_id mapea o utm)
    for (const p of cur.paymentsInRange) {
      if (!p.lead_id) continue;
      const l = leadById.get(p.lead_id);
      if (!l) continue;
      const r = resolve(l);
      if (!r.sid) continue;
      const e = map.get(r.sid);
      if (!e) continue;
      e.cash += p.monto_usd || 0;
    }
    for (const e of map.values()) e.comision = e.cash * 0.03;

    return { rows: Array.from(map.values()).filter((e) => e.total > 0 || e.cash > 0).sort((a, b) => b.total - a.total), landing };
  }, [leads, team, campaigns, cur.paymentsInRange, leadById, monthRange]);

  // ── Cobranzas ──
  const cobranzasStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const cobradoMes = cur.paymentsInRange.reduce((s, p) => s + p.monto_usd, 0);
    const pendientes = payments.filter((p) => p.estado === "pendiente");
    const vencidasGlobal = pendientes.filter((p) => p.fecha_vencimiento && p.fecha_vencimiento <= todayStr);
    const proximas = pendientes.filter((p) => p.fecha_vencimiento && p.fecha_vencimiento > todayStr);
    const porCobrarMes = pendientes
      .filter((p) => p.fecha_vencimiento && p.fecha_vencimiento >= monthRange.start && p.fecha_vencimiento <= monthRange.end)
      .reduce((s, p) => s + p.monto_usd, 0);
    return {
      cobradoMes,
      pendientesCount: pendientes.length,
      vencidasMonto: vencidasGlobal.reduce((s, p) => s + p.monto_usd, 0),
      vencidasCount: vencidasGlobal.length,
      proximasMonto: proximas.reduce((s, p) => s + p.monto_usd, 0),
      proximasCount: proximas.length,
      porCobrarMes,
    };
  }, [payments, cur.paymentsInRange, monthRange]);

  // ── Auditoría: detectar anomalías que inflen cash collected ──
  const auditoria = useMemo(() => {
    const inMonth = cur.paymentsInRange;
    // Top payments del mes (ordenados desc) — para que el usuario vea los más grandes
    const topPayments = [...inMonth]
      .sort((a, b) => b.monto_usd - a.monto_usd)
      .slice(0, 15)
      .map((p) => {
        const l = p.lead_id ? leadById.get(p.lead_id) : null;
        return {
          ...p,
          leadNombre: l?.nombre || "(sin lead)",
          programa: l?.programa_pitcheado || null,
        };
      });

    // Posibles duplicados: mismo lead + mismo monto en ±3 días
    const dupGroups: Array<{ leadId: string | null; nombre: string; monto: number; payments: typeof inMonth }> = [];
    const usedIds = new Set<string>();
    for (let i = 0; i < inMonth.length; i++) {
      const a = inMonth[i];
      if (usedIds.has(a.id)) continue;
      const matches = inMonth.filter((b, j) => {
        if (i === j || usedIds.has(b.id)) return false;
        if (a.lead_id !== b.lead_id) return false;
        if (Math.abs(a.monto_usd - b.monto_usd) > 1) return false;
        const daysDiff = Math.abs(new Date(a.fecha_pago!).getTime() - new Date(b.fecha_pago!).getTime()) / 86400000;
        return daysDiff <= 3;
      });
      if (matches.length > 0) {
        const all = [a, ...matches];
        all.forEach((m) => usedIds.add(m.id));
        dupGroups.push({
          leadId: a.lead_id,
          nombre: a.lead_id ? leadById.get(a.lead_id)?.nombre || "—" : "(sin lead)",
          monto: a.monto_usd,
          payments: all,
        });
      }
    }

    // Payments sin lead_id (huérfanos) — cuentan en cash pero no se asocian a venta
    const huerfanos = inMonth.filter((p) => !p.lead_id);
    const huerfanosTotal = huerfanos.reduce((s, p) => s + p.monto_usd, 0);

    // Payments con receptor null
    const sinReceptor = inMonth.filter((p) => !p.receptor);

    // Renovaciones (es_renovacion=true) — cuentan en cash y se ven aparte
    const renovacionesPays = inMonth.filter((p) => p.es_renovacion);
    const renovacionesTotal = renovacionesPays.reduce((s, p) => s + p.monto_usd, 0);

    return {
      topPayments,
      dupGroups,
      huerfanos,
      huerfanosTotal,
      sinReceptor: sinReceptor.length,
      renovacionesTotal,
      renovacionesCount: renovacionesPays.length,
    };
  }, [cur.paymentsInRange, leadById]);

  // ── Cash collected detalle por método y receptor (normalizado: trim + uppercase para receptor) ──
  const cashDetail = useMemo(() => {
    const byMethod: Record<string, number> = {};
    const byReceptor: Record<string, number> = {};
    let renovaciones = 0, ventasNuevas = 0, cuotas = 0;
    for (const p of cur.paymentsInRange) {
      const m = (p.metodo_pago || "—").trim().toLowerCase();
      const rRaw = (p.receptor || "—").trim();
      const r = rRaw === "—" ? "—" : rRaw.toUpperCase();
      byMethod[m] = (byMethod[m] || 0) + p.monto_usd;
      byReceptor[r] = (byReceptor[r] || 0) + p.monto_usd;
      if (p.es_renovacion) renovaciones += p.monto_usd;
      else if (p.numero_cuota === 1) ventasNuevas += p.monto_usd;
      else cuotas += p.monto_usd;
    }
    return {
      byMethod: Object.entries(byMethod).sort((a, b) => b[1] - a[1]),
      byReceptor: Object.entries(byReceptor).sort((a, b) => b[1] - a[1]),
      ventasNuevas, cuotas, renovaciones,
    };
  }, [cur.paymentsInRange]);

  // ── Renovaciones del mes ──
  const renovsMes = useMemo(() => {
    return renewals.filter((r) => r.fecha_renovacion && r.fecha_renovacion.startsWith(selectedMonth));
  }, [renewals, selectedMonth]);

  // Vencimientos del mes (clientes que cumplen programa este mes)
  const vencimientosMes = useMemo(() => {
    let count = 0;
    const DAY = 86400000;
    for (const c of clients) {
      if (!c.fecha_onboarding) continue;
      const onb = new Date(c.fecha_onboarding.split("T")[0]).getTime();
      const venc = new Date(onb + (c.total_dias_programa || 90) * DAY);
      const v = venc.toISOString().slice(0, 10);
      if (v >= monthRange.start && v <= monthRange.end) count++;
    }
    return count;
  }, [clients, monthRange]);

  // Renovaciones VÁLIDAS: estado=pago Y monto > 0 (las de monto=0 son data sucia)
  const renovsValidas = renovsMes.filter((r) => r.estado === "pago" && (r.monto_total || 0) > 0);
  const renovsIncompletas = renovsMes.filter((r) => r.estado === "pago" && (r.monto_total || 0) === 0);
  const renovsPagas = renovsValidas.length;
  const tasaRenovMes = vencimientosMes > 0 ? renovsPagas / vencimientosMes : 0;

  // ── Gastos del mes (normalizado: pagado_por uppercase + trim) ──
  const gastosStats = useMemo(() => {
    const inMonth = gastos.filter((g) => g.fecha?.startsWith(selectedMonth));
    let totalUsd = 0;
    const byCategoria: Record<string, number> = {};
    const byCaja: Record<string, number> = {};
    const byPagadoPor: Record<string, number> = {};
    for (const g of inMonth) {
      const usd = g.monto_usd || 0;
      totalUsd += usd;
      byCategoria[(g.categoria || "—").trim().toLowerCase()] = (byCategoria[(g.categoria || "—").trim().toLowerCase()] || 0) + usd;
      byCaja[(g.billetera || "—").trim().toLowerCase()] = (byCaja[(g.billetera || "—").trim().toLowerCase()] || 0) + usd;
      const ppRaw = (g.pagado_por || "—").trim();
      const pp = ppRaw === "—" ? "—" : ppRaw.toUpperCase();
      byPagadoPor[pp] = (byPagadoPor[pp] || 0) + usd;
    }
    return {
      total: totalUsd,
      count: inMonth.length,
      byCategoria: Object.entries(byCategoria).sort((a, b) => b[1] - a[1]),
      byCaja: Object.entries(byCaja).sort((a, b) => b[1] - a[1]),
      byPagadoPor: Object.entries(byPagadoPor).sort((a, b) => b[1] - a[1]),
      detalle: inMonth.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")),
    };
  }, [gastos, selectedMonth]);

  // ── Comisiones totales del mes ──
  const teamCommissions = useMemo(() => {
    return computeTeamCommissions({
      leads: leads,
      payments: payments,
      team: team,
      campaigns: campaigns,
      monthStart: monthRange.start,
      monthEnd: monthRange.end,
    });
  }, [leads, payments, team, campaigns, monthRange]);

  // ── COSAS A MEJORAR (insights automáticos) ──
  const cosasAMejorar = useMemo(() => {
    const issues: Array<{ severity: "alta" | "media" | "baja"; titulo: string; detalle: string; cta?: string; href?: string }> = [];

    // % Cierre bajo por closer (sobre presentadas, sin involucrar show rate)
    closersStats.forEach((c) => {
      const cierre = c.presentadas > 0 ? c.cerradas / c.presentadas : 0;
      if (c.presentadas >= 5 && cierre < 0.15) {
        issues.push({
          severity: "alta",
          titulo: `${c.nombre}: % cierre ${pct(cierre)} (${c.cerradas}/${c.presentadas})`,
          detalle: `Cierre muy bajo sobre los que efectivamente vinieron a la call. Revisar grabaciones, cierre de call, oferta y manejo de objeciones. Considerar coaching 1a1 o role-plays.`,
        });
      }
    });

    // Setters con muchos leads cancelados
    if (settersStats.landing > settersStats.rows.reduce((s, r) => s + r.total, 0)) {
      issues.push({
        severity: "media",
        titulo: `${settersStats.landing} agendas como Landing (sin setter atribuido)`,
        detalle: `La mayoría de las agendas vienen sin atribución a un setter. Configurar UTM Builder con utm_medium por setter para trackear quién genera qué.`,
        cta: "Ir a UTM Builder",
        href: "/utm",
      });
    }

    // Renovaciones del mes muy bajas
    if (vencimientosMes >= 5 && tasaRenovMes < 0.4) {
      issues.push({
        severity: "alta",
        titulo: `Tasa de renovación ${pct(tasaRenovMes)} (${renovsPagas} de ${vencimientosMes})`,
        detalle: `Más del 60% de los clientes que vencieron no renovaron. Mel debería enfocarse en estos antes del próximo mes. Revisar /mel-update y /metricas-clientes.`,
        cta: "Ir a Mel Update",
        href: "/mel-update",
      });
    }

    // Renovaciones marcadas como pago pero con monto $0 (data incompleta)
    if (renovsIncompletas.length > 0) {
      issues.push({
        severity: "media",
        titulo: `${renovsIncompletas.length} renovaciones con estado "pago" pero monto $0`,
        detalle: `${renovsIncompletas.map((r) => r.client?.nombre || "?").join(", ")} — fueron cargadas sin importe. No cuentan como renovación real. Cargar el monto en /renovaciones → Historial.`,
        cta: "Ir a Renovaciones",
        href: "/renovaciones",
      });
    }

    // Pagos vencidos
    if (cobranzasStats.vencidasMonto > 5000) {
      issues.push({
        severity: "alta",
        titulo: `${fmt(cobranzasStats.vencidasMonto)} en cuotas vencidas (${cobranzasStats.vencidasCount})`,
        detalle: `Hay cuotas vencidas sin cobrar. Riesgo de churn / pérdida de revenue. Priorizar contacto con esos clientes esta semana.`,
        cta: "Ir a Cobranzas",
        href: "/cobranzas",
      });
    }

    // Pagos huérfanos
    if (auditoria.huerfanos.length > 0) {
      issues.push({
        severity: "media",
        titulo: `${auditoria.huerfanos.length} pagos sin lead asociado (${fmt(auditoria.huerfanosTotal)})`,
        detalle: `Pagos cargados sin vincular al lead. Distorsionan atribución de ventas y comisiones. Hay que asociarlos manualmente.`,
        cta: "Ir a Finanzas",
        href: "/finanzas",
      });
    }

    // Posibles duplicados sin limpiar
    if (auditoria.dupGroups.length > 0) {
      issues.push({
        severity: "alta",
        titulo: `${auditoria.dupGroups.length} grupos de pagos posiblemente duplicados`,
        detalle: `Inflan el cash collected. Limpiar con el botón "🧹 Limpiar duplicados" en la sección de auditoría.`,
      });
    }

    // Gastos con categoría "otros"
    const gastosOtros = gastosStats.byCategoria.find(([k]) => k === "otros");
    if (gastosOtros && gastosOtros[1] > gastosStats.total * 0.2) {
      issues.push({
        severity: "baja",
        titulo: `${fmt(gastosOtros[1])} en gastos sin clasificar (categoría=otros)`,
        detalle: `Más del 20% de los gastos están en "otros". Reclasificarlos para tener visibilidad real de dónde se va la plata.`,
        cta: "Ir a Finanzas",
        href: "/finanzas",
      });
    }

    return issues.sort((a, b) => {
      const order = { alta: 0, media: 1, baja: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [closersStats, settersStats, vencimientosMes, tasaRenovMes, renovsPagas, renovsIncompletas, cobranzasStats, auditoria, gastosStats]);

  // ── PROYECCIÓN MES SIGUIENTE (default $500k objetivo, editable) ──
  const [objetivoMesSig, setObjetivoMesSig] = useState<number>(500000);
  const proyeccion = useMemo(() => {
    // Mes siguiente
    const [y, m] = selectedMonth.split("-").map(Number);
    const nextDate = new Date(y, m, 1);
    const ny = nextDate.getFullYear();
    const nm = nextDate.getMonth() + 1;
    const nextMes = `${ny}-${String(nm).padStart(2, "0")}`;
    const nextStart = `${nextMes}-01`;
    const lastDay = new Date(ny, nm, 0).getDate();
    const nextEnd = `${nextMes}-${String(lastDay).padStart(2, "0")}`;

    // 1) Cuotas pendientes que vencen en el mes siguiente
    let cuotasPendientesSiguiente = 0;
    let cuotasPendientesCount = 0;
    for (const p of payments) {
      if (p.estado !== "pendiente") continue;
      if (!p.fecha_vencimiento) continue;
      const f = p.fecha_vencimiento.split("T")[0];
      if (f >= nextStart && f <= nextEnd) {
        cuotasPendientesSiguiente += p.monto_usd || 0;
        cuotasPendientesCount++;
      }
    }

    // 2) Renovaciones esperadas: clientes que vencen en el mes siguiente × tasa renov histórica
    let vencimientosSiguiente = 0;
    const DAY = 86400000;
    for (const c of clients) {
      if (!c.fecha_onboarding) continue;
      const onb = new Date(c.fecha_onboarding.split("T")[0]).getTime();
      const venc = new Date(onb + (c.total_dias_programa || 90) * DAY);
      const v = venc.toISOString().slice(0, 10);
      if (v >= nextStart && v <= nextEnd) vencimientosSiguiente++;
    }
    const ticketRenovProm = renewals.length > 0
      ? renewals.filter((r) => r.estado === "pago").reduce((s, r) => s + (r.monto_total || 0), 0) /
        Math.max(1, renewals.filter((r) => r.estado === "pago").length)
      : 5000;
    const renovEsperadas = vencimientosSiguiente * (tasaRenovMes || 0.5) * ticketRenovProm;

    // 3) Pipeline: leads en seguimiento/reserva × % cierre histórico × ticket promedio
    const pipelineLeads = leads.filter((l) => l.estado === "seguimiento" || l.estado === "reserva" || l.estado === "pendiente");
    const ticketProm = leads.filter((l) => (l.estado === "cerrado" || l.estado === "adentro_seguimiento") && l.ticket_total > 0)
      .reduce((s, l, _, arr) => s + l.ticket_total / arr.length, 0);
    // Tasa de cierre histórica del mes actual
    const totalPresentadasMes = closersStats.reduce((s, c) => s + c.presentadas, 0);
    const totalCerradasMes = closersStats.reduce((s, c) => s + c.cerradas, 0);
    const cierreHistorico = totalPresentadasMes > 0 ? totalCerradasMes / totalPresentadasMes : 0.2;
    const pipelineEsperado = pipelineLeads.length * cierreHistorico * (ticketProm || 6000) * 0.5; // 50% chance del pipeline cierra

    // 4) Cash de cuotas pasadas que cobramos en mes próximo (tendencia: avg últimos 2 meses de cuotas#2+)
    const cuotasViejasUltMes = cur.paymentsInRange.filter((p) => p.numero_cuota > 1).reduce((s, p) => s + p.monto_usd, 0);

    const cashProyectado = cuotasPendientesSiguiente + renovEsperadas + pipelineEsperado + cuotasViejasUltMes * 0.7;

    return {
      mes: nextMes,
      cuotasPendientes: cuotasPendientesSiguiente,
      cuotasPendientesCount,
      vencimientosSiguiente,
      renovEsperadas,
      pipelineLeadsCount: pipelineLeads.length,
      pipelineEsperado,
      cuotasViejasUltMes,
      cashProyectado,
      ticketRenovProm,
      cierreHistorico,
    };
  }, [selectedMonth, payments, clients, leads, renewals, closersStats, cur.paymentsInRange, tasaRenovMes]);

  const avancePct = objetivoMesSig > 0 ? proyeccion.cashProyectado / objetivoMesSig : 0;
  const gapObjetivo = objetivoMesSig - proyeccion.cashProyectado;

  // ── P&L ──
  const ingresoDevengado = cur.revenue.total;
  const totalComisiones = teamCommissions.reduce((s, r) => s + r.comision_total, 0);
  const totalEgresos = gastosStats.total + totalComisiones;
  const resultadoNeto = ingresoDevengado - totalEgresos;

  // ── Comparación con mes anterior ──
  function delta(curVal: number, prevVal: number): { abs: number; pct: number; positive: boolean } {
    const abs = curVal - prevVal;
    const pctChange = prevVal > 0 ? abs / prevVal : 0;
    return { abs, pct: pctChange, positive: abs >= 0 };
  }
  const dVentas = delta(cur.ventas.total, prev.ventas.total);
  const dCash = delta(cur.cash.total, prev.cash.total);
  const dRev = delta(cur.revenue.total, prev.revenue.total);

  const usedRate = rates.find((r) => r.mes === selectedMonth)?.rate || usdRate;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-10 print:space-y-6">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          h1, h2, h3 { color: black !important; }
          .text-white { color: black !important; }
          .text-\\[var\\(--muted\\)\\] { color: #555 !important; }
          .slide-section { page-break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[var(--card-border)] pb-4 print:border-b-2 print:border-black">
        <div>
          <p className="text-xs uppercase text-[var(--purple-light)] tracking-widest">📅 Cierre de mes — ROMS Consultora</p>
          <h1 className="text-3xl font-bold text-white mt-1">Reporte {selectedMonth}</h1>
          <p className="text-xs text-[var(--muted)] mt-1">USD/ARS aplicado: {usedRate.toLocaleString("en-US")} · Generado {new Date().toLocaleString("es-AR")}</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white" />
          <button onClick={() => window.print()}
            className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg text-sm">
            🖨️ Exportar PDF
          </button>
        </div>
      </div>

      {/* 1) KPIs principales con delta vs mes anterior */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">1️⃣ Resumen ejecutivo</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <BigKpi label="Ventas firmadas" value={fmt(cur.ventas.total)} delta={dVentas} prevLabel={prevRange.label} color="purple" />
          <BigKpi label="Cash Collected" value={fmt(cur.cash.total)} delta={dCash} prevLabel={prevRange.label} color="green" />
          <BigKpi label="Revenue Devengado" value={fmt(cur.revenue.total)} delta={dRev} prevLabel={prevRange.label} color="blue" />
          <div className={`bg-[var(--card-bg)] border ${resultadoNeto >= 0 ? "border-[var(--green)]/40" : "border-[var(--red)]/40"} rounded-xl p-4`}>
            <p className="text-xs text-[var(--muted)] uppercase">Resultado Neto</p>
            <p className={`text-2xl font-bold ${resultadoNeto >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{fmt(resultadoNeto)}</p>
            <p className="text-[10px] text-[var(--muted)] mt-1">Devengado − Egresos</p>
          </div>
        </div>
      </section>

      {/* 2) Por programa */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">2️⃣ Ingresos por programa</h2>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                <th className="py-2 px-3">Programa</th>
                <th className="py-2 px-3 text-right">Ventas firmadas</th>
                <th className="py-2 px-3 text-right">Cash collected</th>
                <th className="py-2 px-3 text-right">Revenue devengado</th>
              </tr>
            </thead>
            <tbody>
              {(["omnipresencia", "multicuentas", "consultoria", "roms_7", "otros"] as const).map((k) => {
                const v = cur.ventas[k]; const c = cur.cash[k]; const r = cur.revenue[k];
                if (v === 0 && c === 0 && r === 0) return null;
                return (
                  <tr key={k} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-3 text-white font-medium">{PROGRAMA_LABELS[k]}</td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--purple-light)]">{fmt(v)}</td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{fmt(c)}</td>
                    <td className="py-2 px-3 text-right font-mono text-blue-400">{fmt(r)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--card-border)] font-bold">
                <td className="py-2 px-3">TOTAL</td>
                <td className="py-2 px-3 text-right font-mono">{fmt(cur.ventas.total)}</td>
                <td className="py-2 px-3 text-right font-mono">{fmt(cur.cash.total)}</td>
                <td className="py-2 px-3 text-right font-mono">{fmt(cur.revenue.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 3) Cash collected detalle */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">3️⃣ Cash collected — desglose</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Stat label="Ventas nuevas (cuota 1)" value={fmt(cashDetail.ventasNuevas)} />
          <Stat label="Cuotas (2 en adelante)" value={fmt(cashDetail.cuotas)} />
          <Stat label="Renovaciones" value={fmt(cashDetail.renovaciones)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SmallTable title="Por método de pago" rows={cashDetail.byMethod} />
          <SmallTable title="Por receptor" rows={cashDetail.byReceptor} />
        </div>
      </section>

      {/* 3.5) AUDITORÍA — anomalías que inflan cash */}
      <section className="slide-section">
        <div className="bg-[var(--card-bg)] border border-yellow-500/40 rounded-xl p-6">
          <h2 className="text-xl font-bold text-yellow-400 mb-2">🔍 Auditoría del mes (¿el cash es real?)</h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            Si Cash Collected te parece muy alto vs Ventas, mirá acá si hay duplicados, montos raros o pagos huérfanos.
          </p>

          {/* Resumen rápido */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Posibles duplicados" value={String(auditoria.dupGroups.length)} color={auditoria.dupGroups.length > 0 ? "red" : "muted"} />
            <Stat label="Pagos huérfanos (sin lead)" value={String(auditoria.huerfanos.length)} sub={fmt(auditoria.huerfanosTotal)} color={auditoria.huerfanos.length > 0 ? "red" : "muted"} />
            <Stat label="Pagos sin receptor" value={String(auditoria.sinReceptor)} color={auditoria.sinReceptor > 0 ? "red" : "muted"} />
            <Stat label="Renovaciones cash" value={fmt(auditoria.renovacionesTotal)} sub={`${auditoria.renovacionesCount} pagos`} color="purple" />
          </div>

          {/* Posibles duplicados */}
          {auditoria.dupGroups.length > 0 && (
            <div className="mb-4 bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-lg p-4">
              <p className="text-sm font-semibold text-[var(--red)] mb-2">⚠️ Posibles duplicados detectados ({auditoria.dupGroups.length})</p>
              <p className="text-[10px] text-[var(--muted)] mb-3">Mismo lead + mismo monto cargado 2+ veces en ±3 días. Revisalos y borrá los duplicados.</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="py-1.5 px-2">Lead</th>
                    <th className="py-1.5 px-2 text-right">Monto</th>
                    <th className="py-1.5 px-2 text-right">Cantidad</th>
                    <th className="py-1.5 px-2 text-right">Total inflado</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.dupGroups.map((g, i) => (
                    <tr key={i} className="border-t border-[var(--card-border)]/30">
                      <td className="py-1.5 px-2 text-white">{g.nombre}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{fmt(g.monto)}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--red)]">{g.payments.length}×</td>
                      <td className="py-1.5 px-2 text-right font-mono text-[var(--red)]">{fmt(g.monto * (g.payments.length - 1))}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[var(--card-border)] font-bold">
                    <td colSpan={3} className="py-1.5 px-2 text-right">Total inflado por duplicados</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[var(--red)]">
                      {fmt(auditoria.dupGroups.reduce((s, g) => s + g.monto * (g.payments.length - 1), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Top 15 pagos del mes (para spot anomalías) */}
          <details className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
            <summary className="cursor-pointer p-3 text-sm text-white hover:bg-white/5">
              📊 Ver top 15 pagos más grandes del mes
            </summary>
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                  <th className="py-1.5 px-2">Fecha</th>
                  <th className="py-1.5 px-2">Lead</th>
                  <th className="py-1.5 px-2">Programa</th>
                  <th className="py-1.5 px-2 text-center">Cuota</th>
                  <th className="py-1.5 px-2">Receptor</th>
                  <th className="py-1.5 px-2">Método</th>
                  <th className="py-1.5 px-2 text-right">Monto USD</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.topPayments.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--card-border)]/30">
                    <td className="py-1.5 px-2 text-[var(--muted)]">{p.fecha_pago?.split("T")[0]}</td>
                    <td className="py-1.5 px-2 text-white">{p.leadNombre}{p.es_renovacion && <span className="ml-1 text-[9px] text-[var(--purple-light)]">[renov]</span>}</td>
                    <td className="py-1.5 px-2 text-[var(--muted)]">{p.programa || "—"}</td>
                    <td className="py-1.5 px-2 text-center text-[var(--muted)]">#{p.numero_cuota}</td>
                    <td className="py-1.5 px-2 text-[var(--muted)]">{p.receptor || "—"}</td>
                    <td className="py-1.5 px-2 text-[var(--muted)]">{p.metodo_pago || "—"}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-[var(--green)]">{fmt(p.monto_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          {auditoria.huerfanos.length > 0 && (
            <details className="bg-[var(--background)] border border-[var(--red)]/30 rounded-lg mt-3">
              <summary className="cursor-pointer p-3 text-sm text-[var(--red)] hover:bg-white/5">
                ⚠️ Ver {auditoria.huerfanos.length} pagos huérfanos (sin lead asociado) — total {fmt(auditoria.huerfanosTotal)}
              </summary>
              <table className="w-full text-xs">
                <tbody>
                  {auditoria.huerfanos.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--card-border)]/30">
                      <td className="py-1.5 px-2 text-[var(--muted)]">{p.fecha_pago?.split("T")[0]}</td>
                      <td className="py-1.5 px-2 text-[var(--muted)]">{p.metodo_pago || "—"}</td>
                      <td className="py-1.5 px-2 text-[var(--muted)]">{p.receptor || "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-[var(--red)]">{fmt(p.monto_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {/* Acciones de dedup */}
          {auditoria.dupGroups.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 no-print">
              <button
                onClick={async () => {
                  const dryRes = await fetch(`/api/admin/dedupe-payments?s=roms-iclosed-2026&dry=1&mes=${selectedMonth}`, { method: "POST" });
                  const dry = await dryRes.json();
                  const ok = window.confirm(
                    `Detectados ${dry.total_groups} grupos de duplicados.\n` +
                    `Voy a marcar ${dry.total_duplicates_to_mark} payments como 'perdido' (NO se borran).\n` +
                    `Total inflado a remover: $${Math.round(dry.total_amount_inflated || 0).toLocaleString()}\n\n` +
                    `Para cada grupo se queda el pago con MÁS DATA (receptor, método, comprobante). Los demás se marcan duplicados.\n\n` +
                    `¿Confirmás?`
                  );
                  if (!ok) return;
                  const res = await fetch(`/api/admin/dedupe-payments?s=roms-iclosed-2026&mes=${selectedMonth}`, { method: "POST" });
                  const json = await res.json();
                  if (json.ok) {
                    alert(`✅ ${json.marked} duplicados marcados. Recargando.`);
                    location.reload();
                  } else {
                    alert("Error: " + (json.error || ""));
                  }
                }}
                className="text-sm bg-[var(--red)]/15 hover:bg-[var(--red)]/35 text-[var(--red)] border border-[var(--red)]/40 px-4 py-2 rounded-lg"
              >
                🧹 Limpiar duplicados de este mes
              </button>
              <span className="text-xs text-[var(--muted)]">
                Marca como &quot;perdido&quot; los duplicados (no se borran, se pueden revisar).
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Duplicados marcados (vista permanente) */}
      <DuplicadosMarcadosSection mes={selectedMonth} />

      {/* 4) Cobranzas */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">4️⃣ Cobranzas</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat label="Cobrado en el mes" value={fmt(cobranzasStats.cobradoMes)} color="green" />
          <Stat label={`Vence en ${selectedMonth}`} value={fmt(cobranzasStats.porCobrarMes)} color="purple" />
          <Stat label="Vencidas (todas)" value={fmt(cobranzasStats.vencidasMonto)} sub={`${cobranzasStats.vencidasCount} cuotas`} color="red" />
          <Stat label="Próximas (a futuro)" value={fmt(cobranzasStats.proximasMonto)} sub={`${cobranzasStats.proximasCount} cuotas`} color="muted" />
        </div>
      </section>

      {/* 5) Closers */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">5️⃣ Performance Closers</h2>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                <th className="py-2 px-3">Closer</th>
                <th className="py-2 px-3 text-right" title="Calls agendadas reales (excluye canceladas, reprogramadas y broke_cancelado)">Agendas</th>
                <th className="py-2 px-3 text-right" title="Excluidas: cancelada / reprogramada / broke_cancelado">Cancel.</th>
                <th className="py-2 px-3 text-right" title="Calls aún pendientes de cargar resultado (data sucia o futuras)">Pend.</th>
                <th className="py-2 px-3 text-right" title="No-shows del mes">No-show</th>
                <th className="py-2 px-3 text-right" title="Leads que fueron a la call (no son pendiente ni no_show)">Presentadas</th>
                <th className="py-2 px-3 text-right" title="% Show Up = presentadas / agendas">% Show</th>
                <th className="py-2 px-3 text-right" title="Calls cerradas (cerrado o adentro_seguimiento)">Cerradas</th>
                <th className="py-2 px-3 text-right" title="% Cierre sobre presentadas = cerradas / presentadas">% Cierre</th>
                <th className="py-2 px-3 text-right">Cash</th>
                <th className="py-2 px-3 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {closersStats.length === 0 ? (
                <tr><td colSpan={11} className="py-6 text-center text-[var(--muted)]">Sin datos</td></tr>
              ) : closersStats.map((c) => (
                <tr key={c.id} className="border-t border-[var(--card-border)]/30">
                  <td className="py-2 px-3 text-white font-medium">{c.nombre}</td>
                  <td className="py-2 px-3 text-right font-bold">{c.agendas}</td>
                  <td className="py-2 px-3 text-right text-[var(--red)]">{c.canceladas}</td>
                  <td className="py-2 px-3 text-right text-yellow-400">{c.pendientes}</td>
                  <td className="py-2 px-3 text-right text-orange-400">{c.noShow}</td>
                  <td className="py-2 px-3 text-right text-[var(--green)]">{c.presentadas}</td>
                  <td className="py-2 px-3 text-right text-[var(--muted)]">{c.agendas > 0 ? pct(c.presentadas / c.agendas) : "—"}</td>
                  <td className="py-2 px-3 text-right text-[var(--purple-light)]">{c.cerradas}</td>
                  <td className="py-2 px-3 text-right text-[var(--muted)]">{c.presentadas > 0 ? pct(c.cerradas / c.presentadas) : "—"}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{fmt(c.cash)}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--purple-light)]">{fmt(c.comision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-2">
          ℹ️ <b>Agendas</b> excluye <b>Cancel.</b> (cancelada/reprogramada/broke_cancelado) · <b>Pend.</b> = sin resultado cargado (data sucia si fecha pasó) · <b>% Show</b> = presentadas/agendas · <b>% Cierre</b> = cerradas/presentadas
        </p>
      </section>

      {/* 6) Setters */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">6️⃣ Performance Setters</h2>
        <p className="text-xs text-[var(--muted)] mb-3">Landing del mes (sin atribución): <b>{settersStats.landing}</b></p>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                <th className="py-2 px-3">Setter</th>
                <th className="py-2 px-3 text-right">Outbound</th>
                <th className="py-2 px-3 text-right">Inbound</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Cerradas</th>
                <th className="py-2 px-3 text-right">Cash atribuido</th>
                <th className="py-2 px-3 text-right">Comisión 3%</th>
              </tr>
            </thead>
            <tbody>
              {settersStats.rows.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-[var(--muted)]">Sin datos</td></tr>
              ) : settersStats.rows.map((s) => (
                <tr key={s.id} className="border-t border-[var(--card-border)]/30">
                  <td className="py-2 px-3 text-white font-medium">{s.nombre}</td>
                  <td className="py-2 px-3 text-right text-orange-400">{s.outbound}</td>
                  <td className="py-2 px-3 text-right text-blue-400">{s.inbound}</td>
                  <td className="py-2 px-3 text-right font-bold">{s.total}</td>
                  <td className="py-2 px-3 text-right text-[var(--purple-light)]">{s.cerradas}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{fmt(s.cash)}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--purple-light)]">{fmt(s.comision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7) Renovaciones del mes */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">7️⃣ Renovaciones del mes</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <Stat label="Vencimientos" value={String(vencimientosMes)} />
          <Stat label="Renovaron (válidas)" value={String(renovsPagas)} color="green" sub={renovsIncompletas.length > 0 ? `${renovsIncompletas.length} incompletas (sin monto)` : undefined} />
          <Stat label="Tasa renovación" value={pct(tasaRenovMes)} color="purple" />
          <Stat label="Revenue renov" value={fmt(renovsValidas.reduce((s, r) => s + (r.monto_total || 0), 0))} color="blue" />
        </div>
        {renovsIncompletas.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-400 font-semibold">
              ⚠️ {renovsIncompletas.length} renovaciones marcadas &quot;pago&quot; pero con monto $0
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">
              No cuentan en tasa de renovación. Cargá el monto real desde <a href="/renovaciones" className="text-[var(--purple-light)] underline">/renovaciones</a> → tab Historial → click en el monto para editar.
            </p>
          </div>
        )}
        {renovsMes.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3">Plan</th>
                  <th className="py-2 px-3">Programa</th>
                  <th className="py-2 px-3 text-right">Monto</th>
                  <th className="py-2 px-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {renovsMes.map((r) => {
                  const incompleta = r.estado === "pago" && (r.monto_total || 0) === 0;
                  return (
                    <tr key={r.id} className={`border-t border-[var(--card-border)]/30 ${incompleta ? "bg-yellow-500/5" : ""}`}>
                      <td className="py-2 px-3 text-white font-medium">{r.client?.nombre || "—"}</td>
                      <td className="py-2 px-3 text-[var(--muted)]">{r.tipo_renovacion || "—"}</td>
                      <td className="py-2 px-3 text-[var(--muted)]">{r.plan_pago || "—"}</td>
                      <td className="py-2 px-3 text-[var(--muted)]">{r.programa_nuevo || r.programa_anterior || "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">{fmt(r.monto_total || 0)}</td>
                      <td className="py-2 px-3">
                        {incompleta ? (
                          <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">🟡 Incompleta</span>
                        ) : (
                          <span className="text-[var(--muted)] text-xs">{r.estado || "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 8) Gastos */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">8️⃣ Gastos del mes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Stat label="Total gastos" value={fmt(gastosStats.total)} color="red" />
          <Stat label="Cantidad" value={String(gastosStats.count)} />
          <Stat label="Comisiones equipo" value={fmt(totalComisiones)} color="purple" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <SmallTable title="Por categoría" rows={gastosStats.byCategoria} />
          <SmallTable title="Por caja" rows={gastosStats.byCaja} />
          <SmallTable title="Por quién gastó" rows={gastosStats.byPagadoPor} />
        </div>
        {gastosStats.detalle.length > 0 && (
          <details className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
            <summary className="cursor-pointer p-3 text-sm text-white hover:bg-white/5">📋 Ver detalle de los {gastosStats.count} gastos</summary>
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Concepto</th>
                  <th className="py-2 px-3">Categoría</th>
                  <th className="py-2 px-3">Caja</th>
                  <th className="py-2 px-3">Pagó</th>
                  <th className="py-2 px-3 text-right">USD</th>
                  <th className="py-2 px-3 text-right">ARS</th>
                </tr>
              </thead>
              <tbody>
                {gastosStats.detalle.map((g) => (
                  <tr key={g.id} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-3 text-[var(--muted)] text-xs">{g.fecha}</td>
                    <td className="py-2 px-3 text-white text-xs">{g.concepto}</td>
                    <td className="py-2 px-3 text-[var(--muted)] text-xs">{(g.categoria || "—").toLowerCase()}</td>
                    <td className="py-2 px-3 text-[var(--muted)] text-xs">{(g.billetera || "—").toLowerCase()}</td>
                    <td className="py-2 px-3 text-[var(--muted)] text-xs">{g.pagado_por ? g.pagado_por.toUpperCase().trim() : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-[var(--red)]">{fmt(g.monto_usd || 0)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-[var(--muted)]">{(g.monto_ars || 0) > 0 ? Math.round(g.monto_ars).toLocaleString("en-US") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      {/* 9) P&L */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">9️⃣ Estado de Resultados</h2>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--muted)]">Revenue Devengado (ingresos)</span>
            <span className="font-mono text-[var(--green)]">{fmt(ingresoDevengado)}</span>
          </div>
          <div className="border-t border-[var(--card-border)] pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Gastos operativos</span>
              <span className="font-mono">{fmt(gastosStats.total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Comisiones equipo</span>
              <span className="font-mono">{fmt(totalComisiones)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span className="text-[var(--red)]">Total egresos</span>
              <span className="font-mono text-[var(--red)]">{fmt(totalEgresos)}</span>
            </div>
          </div>
          <div className="border-t-2 border-[var(--card-border)] pt-3 flex justify-between text-2xl font-bold">
            <span>Resultado Neto</span>
            <span className={resultadoNeto >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>{fmt(resultadoNeto)}</span>
          </div>
          {ingresoDevengado > 0 && (
            <p className="text-xs text-[var(--muted)] text-right">
              Margen: {pct(resultadoNeto / ingresoDevengado)}
            </p>
          )}
        </div>
      </section>

      {/* 10) Comisiones individuales */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">🔟 Comisiones por persona</h2>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                <th className="py-2 px-3">Persona</th>
                <th className="py-2 px-3 text-right">Closer</th>
                <th className="py-2 px-3 text-right">Setter</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {teamCommissions.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-[var(--muted)]">Sin comisiones</td></tr>
              ) : teamCommissions.map((c) => (
                <tr key={c.id} className="border-t border-[var(--card-border)]/30">
                  <td className="py-2 px-3 text-white font-medium">{c.nombre}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--purple-light)]">{fmt(c.comision_closer)}</td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{fmt(c.comision_setter)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{fmt(c.comision_total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--card-border)] font-bold">
                <td className="py-2 px-3">TOTAL A PAGAR</td>
                <td colSpan={2}></td>
                <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{fmt(totalComisiones)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 11) COSAS A MEJORAR */}
      <section className="slide-section">
        <h2 className="text-xl font-bold text-white mb-4">1️⃣1️⃣ Cosas a mejorar</h2>
        {cosasAMejorar.length === 0 ? (
          <div className="bg-[var(--green)]/10 border border-[var(--green)]/40 rounded-xl p-5">
            <p className="text-sm text-[var(--green)]">✅ No detecté problemas significativos este mes. Buen trabajo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cosasAMejorar.map((iss, i) => {
              const colorMap = {
                alta: { border: "border-[var(--red)]/40", bg: "bg-[var(--red)]/5", icon: "🔴", text: "text-[var(--red)]" },
                media: { border: "border-yellow-400/40", bg: "bg-yellow-400/5", icon: "🟡", text: "text-yellow-400" },
                baja: { border: "border-blue-400/40", bg: "bg-blue-400/5", icon: "🔵", text: "text-blue-400" },
              };
              const c = colorMap[iss.severity];
              return (
                <div key={i} className={`${c.bg} border ${c.border} rounded-xl p-4`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <p className={`text-sm font-semibold ${c.text} flex items-center gap-2`}>
                        <span>{c.icon}</span>
                        <span className="text-[10px] uppercase tracking-wider">{iss.severity}</span>
                        <span className="text-white">— {iss.titulo}</span>
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-1.5 ml-7">{iss.detalle}</p>
                    </div>
                    {iss.cta && iss.href && (
                      <a href={iss.href}
                        className="text-xs bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--purple)] text-white px-3 py-1.5 rounded-lg whitespace-nowrap no-print">
                        {iss.cta} →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 12) PROYECCIÓN MES SIGUIENTE */}
      <section className="slide-section">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold text-white">1️⃣2️⃣ Proyección {proyeccion.mes}</h2>
          <div className="flex items-center gap-2 no-print">
            <span className="text-xs text-[var(--muted)]">Objetivo:</span>
            <input type="number" value={objetivoMesSig} onChange={(e) => setObjetivoMesSig(Number(e.target.value) || 0)}
              step={10000} min={0}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-3 py-1.5 text-sm text-white w-32" />
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 mb-4">
          <div className="flex justify-between items-baseline mb-3">
            <div>
              <p className="text-xs uppercase text-[var(--muted)]">Cash proyectado</p>
              <p className="text-3xl font-bold text-[var(--green)]">{fmt(proyeccion.cashProyectado)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-[var(--muted)]">Objetivo</p>
              <p className="text-2xl font-bold text-white">{fmt(objetivoMesSig)}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {avancePct >= 1 ? "✅ Por encima" : `⚠️ Falta ${fmt(gapObjetivo)}`} ({pct(avancePct)})
              </p>
            </div>
          </div>
          <div className="bg-white/5 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${avancePct >= 1 ? "bg-[var(--green)]" : avancePct >= 0.7 ? "bg-yellow-400" : "bg-[var(--red)]"}`}
              style={{ width: `${Math.min(avancePct * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Cómo se calcula la proyección — explícito */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-white mb-3">📐 Cómo se calcula esta proyección</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="py-2 px-2">Componente</th>
                <th className="py-2 px-2">Fuente de datos</th>
                <th className="py-2 px-2">Fórmula</th>
                <th className="py-2 px-2 text-right">Aporta</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--card-border)]/30">
                <td className="py-2 px-2 text-[var(--green)] font-medium">💰 Cuotas a cobrar</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">payments con estado=pendiente y fecha_vencimiento en {proyeccion.mes}</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">Suma directa</td>
                <td className="py-2 px-2 text-right font-mono text-[var(--green)]">{fmt(proyeccion.cuotasPendientes)}</td>
              </tr>
              <tr className="border-t border-[var(--card-border)]/30">
                <td className="py-2 px-2 text-[var(--purple-light)] font-medium">🔄 Renovaciones</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">clients cuyo programa termina en {proyeccion.mes}</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">{proyeccion.vencimientosSiguiente} vencen × {pct(tasaRenovMes || 0.5)} renov × {fmt(proyeccion.ticketRenovProm)}</td>
                <td className="py-2 px-2 text-right font-mono text-[var(--purple-light)]">{fmt(proyeccion.renovEsperadas)}</td>
              </tr>
              <tr className="border-t border-[var(--card-border)]/30">
                <td className="py-2 px-2 text-blue-400 font-medium">🎯 Pipeline</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">leads en seguimiento, reserva, pendiente</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">{proyeccion.pipelineLeadsCount} × {pct(proyeccion.cierreHistorico)} cierre × ticket prom × 50% (factor confianza)</td>
                <td className="py-2 px-2 text-right font-mono text-blue-400">{fmt(proyeccion.pipelineEsperado)}</td>
              </tr>
              <tr className="border-t border-[var(--card-border)]/30">
                <td className="py-2 px-2 text-orange-400 font-medium">📅 Cuotas viejas</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">run rate del mes anterior (cuotas#2+)</td>
                <td className="py-2 px-2 text-xs text-[var(--muted)]">{fmt(proyeccion.cuotasViejasUltMes)} × 70%</td>
                <td className="py-2 px-2 text-right font-mono text-orange-400">{fmt(proyeccion.cuotasViejasUltMes * 0.7)}</td>
              </tr>
              <tr className="border-t-2 border-[var(--card-border)] font-bold">
                <td colSpan={3} className="py-2 px-2 text-right">Total proyectado</td>
                <td className="py-2 px-2 text-right font-mono text-[var(--green)]">{fmt(proyeccion.cashProyectado)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-[var(--muted)] mt-3">
            ℹ️ La tasa de cierre y renovación usan los datos históricos del mes seleccionado. Si esos % cambian (mejor o peor), la proyección se ajusta.
          </p>
        </div>

        {/* QUÉ TIENE QUE PASAR para cumplir el objetivo */}
        <div className="bg-[var(--card-bg)] border border-[var(--purple)]/40 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-3">🎯 Qué tiene que pasar para llegar a {fmt(objetivoMesSig)}</h3>
          {avancePct >= 1 ? (
            <p className="text-sm text-[var(--green)]">
              ✅ Con la proyección actual ya estás por encima del objetivo.<br/>
              <span className="text-xs text-[var(--muted)]">Hay holgura de {fmt(proyeccion.cashProyectado - objetivoMesSig)}. Mantener el pace y enfocarse en calidad de cierres.</span>
            </p>
          ) : (
            <>
              <p className="text-sm text-white mb-4">
                Faltan <b className="text-[var(--red)]">{fmt(gapObjetivo)}</b> para llegar al objetivo. Tenés 4 palancas para cerrar la brecha:
              </p>
              <div className="space-y-3">
                {/* Palanca 1: Cobrar todas las cuotas */}
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">1️⃣ Cobrar el 100% de las cuotas pendientes</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Hay {proyeccion.cuotasPendientesCount} cuotas con vencimiento en {proyeccion.mes}. Si recuperás todas → ya están en la proyección.
                        Recuperar también las {cobranzasStats.vencidasCount} vencidas anteriores: <b className="text-white">{fmt(cobranzasStats.vencidasMonto)}</b>
                      </p>
                    </div>
                    <span className="text-sm font-mono text-[var(--green)] whitespace-nowrap">+{fmt(cobranzasStats.vencidasMonto)}</span>
                  </div>
                </div>

                {/* Palanca 2: Renovaciones */}
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">2️⃣ Subir la tasa de renovación al 70%</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Tasa actual: {pct(tasaRenovMes || 0)}. Si subís al 70% sobre los {proyeccion.vencimientosSiguiente} vencimientos de {proyeccion.mes}:
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Acción: Mel debe contactar TODOS los que vencen antes de los últimos 7 días, ofrecer plan personalizado.
                      </p>
                    </div>
                    <span className="text-sm font-mono text-[var(--purple-light)] whitespace-nowrap">+{fmt((proyeccion.vencimientosSiguiente * 0.7 - proyeccion.vencimientosSiguiente * (tasaRenovMes || 0.5)) * proyeccion.ticketRenovProm)}</span>
                  </div>
                </div>

                {/* Palanca 3: Ventas nuevas */}
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">3️⃣ Cerrar ventas nuevas</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Si el ticket promedio es ~$6.000 (PIF) o $18.000-30.000 (full Omni/Multi):
                      </p>
                      <ul className="text-xs text-[var(--muted)] mt-1 ml-4 list-disc space-y-0.5">
                        <li><b className="text-white">{Math.ceil(gapObjetivo / 18000)} ventas Omni</b> ($18k c/u PIF) — ó equivalente en Multi</li>
                        <li>O <b className="text-white">{Math.ceil(gapObjetivo / 6000)} ventas con primera cuota cobrada</b> (~$6k c/u)</li>
                      </ul>
                    </div>
                    <span className="text-sm font-mono text-blue-400 whitespace-nowrap">cubre brecha</span>
                  </div>
                </div>

                {/* Palanca 4: Mejorar cierre */}
                <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">4️⃣ Subir tasa de cierre del pipeline existente</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Hay {proyeccion.pipelineLeadsCount} leads en seguimiento/reserva. Si la tasa de cierre histórica ({pct(proyeccion.cierreHistorico)}) sube +5pp:
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Acción: foco en grabaciones de calls perdidas, role-plays con closers, mejorar cierre de Q3 sales.
                      </p>
                    </div>
                    <span className="text-sm font-mono text-orange-400 whitespace-nowrap">+{fmt(proyeccion.pipelineLeadsCount * 0.05 * 6000 * 0.5)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--card-border)]/50">
                <p className="text-xs text-[var(--muted)]">
                  💡 <b>Plan más realista:</b> combinar las 4 palancas — cobrar las vencidas + 1-2 renovs extra + 3-5 ventas nuevas + 1-2 cierres extra del pipeline = tipicamente alcanza el target.
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-xs text-[var(--muted)] pt-6 border-t border-[var(--card-border)]">
        Reporte generado automáticamente · ROMS CRM · {new Date().toLocaleString("es-AR")}
      </div>
    </div>
  );
}

function BigKpi({ label, value, delta, prevLabel, color }: { label: string; value: string; delta: { abs: number; pct: number; positive: boolean }; prevLabel: string; color: "purple" | "green" | "blue" }) {
  const colorMap = {
    purple: "text-[var(--purple-light)] border-[var(--purple)]/40",
    green: "text-[var(--green)] border-[var(--green)]/40",
    blue: "text-blue-400 border-blue-400/40",
  };
  return (
    <div className={`bg-[var(--card-bg)] border ${colorMap[color].split(" ")[1]} rounded-xl p-4`}>
      <p className="text-xs text-[var(--muted)] uppercase">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color].split(" ")[0]}`}>{value}</p>
      <p className={`text-[10px] mt-1 ${delta.positive ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
        {delta.positive ? "▲" : "▼"} {fmt(Math.abs(delta.abs))} ({(delta.pct * 100).toFixed(0)}%) vs {prevLabel}
      </p>
    </div>
  );
}

function Stat({ label, value, sub, color = "white" }: { label: string; value: string; sub?: string; color?: "white" | "green" | "red" | "purple" | "blue" | "muted" }) {
  const colorMap: Record<string, string> = {
    white: "text-white", green: "text-[var(--green)]", red: "text-[var(--red)]",
    purple: "text-[var(--purple-light)]", blue: "text-blue-400", muted: "text-[var(--muted)]",
  };
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <p className="text-xs text-[var(--muted)] uppercase">{label}</p>
      <p className={`text-xl font-bold ${colorMap[color]} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function DuplicadosMarcadosSection({ mes }: { mes: string }) {
  const [data, setData] = useState<{ count: number; rows: Array<{ id: string; lead?: { nombre: string } | null; lead_nombre?: string; monto_usd: number; fecha_pago: string | null; numero_cuota: number; receptor: string | null; metodo_pago: string | null; notas: string | null }> } | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dedupe-payments?s=roms-iclosed-2026`);
      const json = await res.json();
      if (json.ok) setData({ count: json.count, rows: json.duplicados });
    } finally {
      setLoading(false);
    }
  }

  // Filter by month
  const filtered = data?.rows.filter((r) => r.fecha_pago?.startsWith(mes)) || [];

  async function unmark(id: string) {
    if (!confirm("¿Restaurar este pago como pagado? Volverá a sumar al cash collected.")) return;
    const res = await fetch("/api/pagos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado: "pagado" }),
    });
    const json = await res.json();
    if (json.ok) {
      alert("Restaurado. Recargando.");
      location.reload();
    } else {
      alert("Error: " + (json.error || ""));
    }
  }

  return (
    <section className="slide-section">
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-white">📁 Duplicados archivados</h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              Pagos marcados como duplicados (estado=perdido, NO suman al cash). Conservados para auditoría.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="text-sm bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--purple)] text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
            {loading ? "Cargando..." : data ? "🔄 Recargar" : "📥 Cargar lista"}
          </button>
        </div>

        {!data ? (
          <p className="text-sm text-[var(--muted)]">Cliqueá &quot;Cargar lista&quot; para ver los duplicados archivados.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin duplicados archivados en {mes}. Total global: {data.count}.</p>
        ) : (
          <>
            <p className="text-xs text-[var(--muted)] mb-2">{filtered.length} duplicados archivados en {mes} de {data.count} totales:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-white/5">
                  <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                    <th className="py-1.5 px-2">Fecha</th>
                    <th className="py-1.5 px-2">Lead</th>
                    <th className="py-1.5 px-2 text-center">Cuota</th>
                    <th className="py-1.5 px-2">Receptor</th>
                    <th className="py-1.5 px-2 text-right">Monto</th>
                    <th className="py-1.5 px-2">Marcado como dup de</th>
                    <th className="py-1.5 px-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const dupOf = r.notas?.match(/DUPLICATE_OF=([0-9a-f-]+)/)?.[1] || "?";
                    return (
                      <tr key={r.id} className="border-t border-[var(--card-border)]/30">
                        <td className="py-1.5 px-2 text-[var(--muted)]">{r.fecha_pago?.split("T")[0]}</td>
                        <td className="py-1.5 px-2 text-white">{r.lead?.nombre || "—"}</td>
                        <td className="py-1.5 px-2 text-center text-[var(--muted)]">#{r.numero_cuota}</td>
                        <td className="py-1.5 px-2 text-[var(--muted)]">{r.receptor || "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-[var(--muted)] line-through">{fmt(r.monto_usd)}</td>
                        <td className="py-1.5 px-2 text-[var(--muted)] font-mono text-[10px]">{dupOf.slice(0, 8)}</td>
                        <td className="py-1.5 px-2 text-center">
                          <button onClick={() => unmark(r.id)}
                            className="text-[10px] bg-[var(--green)]/15 hover:bg-[var(--green)]/35 text-[var(--green)] px-2 py-0.5 rounded">
                            ↶ Restaurar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SmallTable({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      <p className="text-xs uppercase text-[var(--muted)] p-3 border-b border-[var(--card-border)]">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)] p-3">Sin datos</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-[var(--card-border)]/30">
                <td className="py-1.5 px-3 text-white">{k}</td>
                <td className="py-1.5 px-3 text-right font-mono">{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
