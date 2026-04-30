"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatUSD } from "@/lib/format";
import type { ClientLite, RenewalLite } from "./page";

interface Props {
  clients: ClientLite[];
  renewals: RenewalLite[];
}

const PROGRAMA_LABELS: Record<string, string> = {
  roms_7: "ROMS 7", consultoria: "Consultoría", omnipresencia: "Omnipresencia", multicuentas: "Multicuentas",
};

const ESTADOS = ["activo", "pausado", "inactivo", "solo_skool", "no_termino_pagar"];
const ESTADOS_CONTACTO = [
  "por_contactar", "contactado", "respondio_renueva", "respondio_debe_cuota",
  "es_socio", "no_renueva", "no_responde", "numero_invalido", "retirar_acceso", "verificar",
];

const RENOVA_OK = new Set(["pago", "cuota_1_pagada", "cuota_2_pagada"]);
const NO_RENUEVA_STATES = new Set(["no_renueva", "retirar_acceso", "broke_cancelado"]);

const fmtPct = (n: number) => Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";

function isHistorico(c: ClientLite): boolean {
  return !!c.notas_seguimiento && c.notas_seguimiento.includes("[HIST_DISCORD]");
}

function daysUntilEnd(c: ClientLite): number | null {
  if (!c.fecha_onboarding) return null;
  const onb = new Date(c.fecha_onboarding);
  const end = new Date(onb.getTime() + c.total_dias_programa * 86400000);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

export default function MetricasClientesClient({ clients: initialClients, renewals }: Props) {
  const [clients, setClients] = useState(initialClients);
  const [filterPrograma, setFilterPrograma] = useState<string>("todos");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [includeHistoricos, setIncludeHistoricos] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Apply filters for METRICS (always exclude histórico unless toggled)
  const baseScope = useMemo(() => {
    return clients.filter((c) => includeHistoricos || !isHistorico(c));
  }, [clients, includeHistoricos]);

  const filtered = useMemo(() => {
    return baseScope.filter((c) => {
      if (filterPrograma !== "todos" && c.programa !== filterPrograma) return false;
      if (filterEstado !== "todos" && c.estado !== filterEstado) return false;
      if (search && !c.nombre.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [baseScope, filterPrograma, filterEstado, search]);

  // ─── KPIs ───
  const total = filtered.length;
  const activos = filtered.filter((c) => c.estado === "activo").length;
  const inactivos = filtered.filter((c) => c.estado === "inactivo").length;
  const pausados = filtered.filter((c) => c.estado === "pausado").length;
  const historicosCount = clients.filter(isHistorico).length;

  const today = new Date();
  const terminaron = filtered.filter((c) => {
    if (c.fecha_offboarding) return true;
    if (c.estado === "inactivo") return true;
    if (!c.fecha_onboarding) return false;
    const onb = new Date(c.fecha_onboarding);
    const end = new Date(onb.getTime() + c.total_dias_programa * 86400000);
    return end < today;
  });

  const clientIdsWithRenewal = useMemo(() => new Set(
    renewals.filter((r) => r.estado && RENOVA_OK.has(r.estado)).map((r) => r.client_id)
  ), [renewals]);
  const renovaron = terminaron.filter((c) => clientIdsWithRenewal.has(c.id)).length;
  const tasaRenovacion = terminaron.length > 0 ? renovaron / terminaron.length : 0;

  const churnedSet = new Set<string>();
  for (const c of terminaron) {
    if (NO_RENUEVA_STATES.has(c.estado_contacto)) churnedSet.add(c.id);
    if (c.estado === "inactivo" && !clientIdsWithRenewal.has(c.id)) churnedSet.add(c.id);
    if (!clientIdsWithRenewal.has(c.id) && c.fecha_offboarding) churnedSet.add(c.id);
  }
  const churnRate = terminaron.length > 0 ? churnedSet.size / terminaron.length : 0;

  const conExito = filtered.filter((c) => c.exito).length;
  const pesadillaCount = filtered.filter((c) => c.pesadilla).length;
  const tasaExito = total > 0 ? conExito / total : 0;
  const sinEvaluar = filtered.filter((c) => !c.exito && !c.pesadilla && c.estado !== "inactivo").length;

  const deudorTotal = filtered.reduce((s, c) => s + (c.deudor_usd || 0), 0);

  // ─── Cohort by month ───
  const cohortRetention = useMemo(() => {
    const buckets = new Map<string, { total: number; activos: number; renovaron: number; exito: number }>();
    for (const c of filtered) {
      if (!c.fecha_onboarding) continue;
      const ym = c.fecha_onboarding.split("T")[0].substring(0, 7);
      if (!buckets.has(ym)) buckets.set(ym, { total: 0, activos: 0, renovaron: 0, exito: 0 });
      const b = buckets.get(ym)!;
      b.total++;
      if (c.estado === "activo") b.activos++;
      if (clientIdsWithRenewal.has(c.id)) b.renovaron++;
      if (c.exito) b.exito++;
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, b]) => ({
        mes: ym, total: b.total, activos: b.activos, renovaron: b.renovaron, exito: b.exito,
        retencion_pct: b.total > 0 ? b.activos / b.total : 0,
        renovacion_pct: b.total > 0 ? b.renovaron / b.total : 0,
      }));
  }, [filtered, clientIdsWithRenewal]);

  const programas = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) if (c.programa) set.add(c.programa);
    return [...set];
  }, [clients]);

  const porPrograma = useMemo(() => {
    const map = new Map<string, { total: number; activos: number; conExito: number; renovaron: number; pesadilla: number; deudor: number }>();
    for (const c of filtered) {
      const p = c.programa || "sin_programa";
      if (!map.has(p)) map.set(p, { total: 0, activos: 0, conExito: 0, renovaron: 0, pesadilla: 0, deudor: 0 });
      const b = map.get(p)!;
      b.total++;
      if (c.estado === "activo") b.activos++;
      if (c.exito) b.conExito++;
      if (c.pesadilla) b.pesadilla++;
      if (clientIdsWithRenewal.has(c.id)) b.renovaron++;
      b.deudor += c.deudor_usd || 0;
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [filtered, clientIdsWithRenewal]);

  // ─── Inline edit ───
  async function patch(id: string, field: string, value: string | number | boolean | null) {
    setBusy(id + ":" + field);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setClients((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 Métricas de Clientes</h1>
          <p className="text-sm text-[var(--muted)]">
            Renovación · Churn · Éxito · Cohort por mes —{" "}
            <Link href="/metricas-clientes/explicacion" className="text-[var(--purple-light)] hover:underline">📘 ver guía</Link>
            {" · "}
            <Link href="/mel-update" className="text-[var(--purple-light)] hover:underline">📋 form Mel</Link>
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <select value={filterPrograma} onChange={(e) => setFilterPrograma(e.target.value)}
          className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-xs text-white">
          <option value="todos">Todos los programas</option>
          {programas.map((p) => (<option key={p} value={p}>{PROGRAMA_LABELS[p] || p}</option>))}
        </select>
        <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
          className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-xs text-white">
          <option value="todos">Todos los estados</option>
          {ESTADOS.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 buscar..."
          className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-xs text-white" />
        <label className="flex items-center gap-2 text-xs text-[var(--muted)] ml-2">
          <input type="checkbox" checked={includeHistoricos} onChange={(e) => setIncludeHistoricos(e.target.checked)} />
          Incluir históricos ({historicosCount})
        </label>
        <span className="ml-auto text-xs text-[var(--muted)]">{filtered.length} clientes</span>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total" value={total.toString()} color="white"
          sub={`${activos} activ · ${inactivos} inactiv · ${pausados} paus`}
          help="Cantidad de clientes que cumplen los filtros de arriba (programa, estado, búsqueda).
Por defecto NO incluye los clientes históricos del Discord standby — activá el toggle para sumarlos." />
        <KPI label="Tasa de renovación" value={fmtPct(tasaRenovacion)} color="green"
          sub={`${renovaron} de ${terminaron.length} terminaron`}
          help={`Fórmula: clientes que renovaron / clientes que terminaron el programa.

"Terminaron" = cumple alguna:
• tiene fecha_offboarding cargada
• estado = inactivo
• fecha_onboarding + total_dias_programa ya pasó (90d ROMS7/Consult, 120d Omni/Multi)

"Renovaron" = de los que terminaron, los que tienen al menos 1 fila en renewal_history con estado pago / cuota_1_pagada / cuota_2_pagada.

Para alimentarla: cargar en /renovaciones cada cliente que renueve.`} />
        <KPI label="Churn rate" value={fmtPct(churnRate)} color="red"
          sub={`${churnedSet.size} de ${terminaron.length} terminaron`}
          help={`Fórmula: clientes que NO renovaron / clientes que terminaron.

Cuenta como churn si:
• estado_contacto está en (no_renueva, retirar_acceso, broke_cancelado), o
• estado = inactivo y no tiene renewal en renewal_history, o
• tiene fecha_offboarding pero no hay renovación.

Para alimentarla: marcar estado_contacto y estado correctamente desde /mel-update.`} />
        <KPI label="Tasa de éxito" value={fmtPct(tasaExito)} color="purple"
          sub={`${conExito} éxito · ${pesadillaCount} pesadilla · ${sinEvaluar} sin evaluar`}
          help={`Fórmula: clientes con flag exito=true / total clientes.

Es 100% MANUAL. Mel marca el flag ✅ Éxito (caso testimonial / resultados) o ⚠️ Pesadilla (cliente difícil) desde /mel-update o desde la tabla editable de abajo.

Sin evaluar = no tiene ni éxito ni pesadilla y aún sigue activo. Esos son los que falta revisar.`} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Renovaciones registradas" value={renewals.length.toString()} color="white"
          sub={`${renewals.filter((r) => r.estado && RENOVA_OK.has(r.estado)).length} pagas`}
          help="Filas totales en la tabla renewal_history (incluye pendientes y canceladas). Las 'pagas' son las que tienen estado pago / cuota_1_pagada / cuota_2_pagada — esas son las que cuentan para 'Tasa de renovación'." />
        <KPI label="Revenue renov" value={formatUSD(renewals.reduce((s, r) => s + (r.monto_total || 0), 0))} color="green"
          sub="Total acumulado"
          help="Suma del campo monto_total de TODAS las filas de renewal_history (sin filtro de estado). Si una renovación se cargó sin monto, suma 0." />
        <KPI label="Ticket promedio renov" value={renewals.length > 0 ? formatUSD(renewals.reduce((s, r) => s + (r.monto_total || 0), 0) / renewals.length) : "—"} color="purple"
          help="Revenue total / cantidad de filas en renewal_history. Promedio simple — incluye renovaciones sin monto cargado, así que puede estar subestimado." />
        <KPI label="Deuda total" value={formatUSD(deudorTotal)} color="red"
          sub={`${filtered.filter((c) => (c.deudor_usd || 0) > 0).length} con deuda`}
          help="Suma del campo deudor_usd de los clientes filtrados. Se carga manualmente por cliente en /clientes/[id] o /mel-update." />
      </div>

      {/* Cohort por mes */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
          Cohort por mes de onboarding
          <InfoTip text={`Agrupa los clientes filtrados por el mes en que arrancaron (fecha_onboarding).
Para cada mes muestra qué pasó después: cuántos siguen activos, cuántos renovaron, cuántos fueron éxito.
Sirve para comparar performance entre meses (¿el lote de enero retiene mejor que el de diciembre?).`} />
        </h2>
        {cohortRetention.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin datos. Asegurate de tener clientes con fecha_onboarding cargada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="py-2 px-2">Mes</th>
                  <th className="py-2 px-2 text-right">Onboarding<InfoTip text="Cuántos clientes nuevos arrancaron ese mes (fecha_onboarding cae ahí)." /></th>
                  <th className="py-2 px-2 text-right">Activos hoy<InfoTip text="De los que arrancaron ese mes, cuántos hoy todavía tienen estado=activo." /></th>
                  <th className="py-2 px-2 text-right">% Retención<InfoTip text="Activos hoy / Onboarding del mes. Mide qué % del lote sigue adentro." /></th>
                  <th className="py-2 px-2 text-right">Renovaron<InfoTip text="De los que arrancaron ese mes, cuántos tienen al menos una renewal_history con estado pagado." /></th>
                  <th className="py-2 px-2 text-right">% Renovación<InfoTip text="Renovaron / Onboarding del mes." /></th>
                  <th className="py-2 px-2 text-right">Éxito<InfoTip text="De los que arrancaron ese mes, cuántos tienen el flag exito=true (marca manual de Mel)." /></th>
                </tr>
              </thead>
              <tbody>
                {cohortRetention.map((c) => (
                  <tr key={c.mes} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-2 text-white font-medium">{c.mes}</td>
                    <td className="py-2 px-2 text-right text-white">{c.total}</td>
                    <td className="py-2 px-2 text-right text-[var(--green)]">{c.activos}</td>
                    <td className="py-2 px-2 text-right text-[var(--muted)]">{fmtPct(c.retencion_pct)}</td>
                    <td className="py-2 px-2 text-right text-[var(--purple-light)]">{c.renovaron}</td>
                    <td className="py-2 px-2 text-right text-[var(--muted)]">{fmtPct(c.renovacion_pct)}</td>
                    <td className="py-2 px-2 text-right text-[var(--green)]">{c.exito}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Por programa */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
          Por programa
          <InfoTip text="Mismas métricas que arriba pero agrupadas por programa (ROMS 7, Consultoría, Omnipresencia, Multicuentas). Útil para ver qué línea performa mejor." />
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="py-2 px-2">Programa</th>
                <th className="py-2 px-2 text-right">Total</th>
                <th className="py-2 px-2 text-right">Activos</th>
                <th className="py-2 px-2 text-right">Éxito</th>
                <th className="py-2 px-2 text-right">% Éxito</th>
                <th className="py-2 px-2 text-right">Pesadilla</th>
                <th className="py-2 px-2 text-right">Renovaron</th>
                <th className="py-2 px-2 text-right">% Renov</th>
                <th className="py-2 px-2 text-right">Deuda</th>
              </tr>
            </thead>
            <tbody>
              {porPrograma.map(([p, b]) => (
                <tr key={p} className="border-t border-[var(--card-border)]/30">
                  <td className="py-2 px-2 text-white font-medium">{PROGRAMA_LABELS[p] || p}</td>
                  <td className="py-2 px-2 text-right text-white">{b.total}</td>
                  <td className="py-2 px-2 text-right text-[var(--green)]">{b.activos}</td>
                  <td className="py-2 px-2 text-right text-[var(--purple-light)]">{b.conExito}</td>
                  <td className="py-2 px-2 text-right text-[var(--muted)]">{fmtPct(b.total > 0 ? b.conExito / b.total : 0)}</td>
                  <td className="py-2 px-2 text-right text-[var(--red)]">{b.pesadilla}</td>
                  <td className="py-2 px-2 text-right text-[var(--purple-light)]">{b.renovaron}</td>
                  <td className="py-2 px-2 text-right text-[var(--muted)]">{fmtPct(b.total > 0 ? b.renovaron / b.total : 0)}</td>
                  <td className="py-2 px-2 text-right text-[var(--red)]">{b.deudor > 0 ? formatUSD(b.deudor) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lista editable de clientes */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Clientes ({filtered.length})</h2>
          <p className="text-xs text-[var(--muted)]">Cambios se guardan al instante</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">Programa</th>
                <th className="py-2 px-2">Onb</th>
                <th className="py-2 px-2 text-right">Días</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2">Contacto</th>
                <th className="py-2 px-2 text-center">✅</th>
                <th className="py-2 px-2 text-center">⚠️</th>
                <th className="py-2 px-2 text-right">Deuda</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-[var(--muted)]">Sin resultados</td></tr>
              ) : filtered.map((c) => {
                const days = daysUntilEnd(c);
                const dayColor = days === null ? "text-[var(--muted)]"
                  : days < 0 ? "text-[var(--red)]"
                  : days <= 7 ? "text-[var(--yellow)]"
                  : days <= 30 ? "text-[var(--purple-light)]"
                  : "text-white";
                const hist = isHistorico(c);
                const dis = !!busy && busy.startsWith(c.id);
                return (
                  <tr key={c.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                    <td className="py-2 px-2">
                      <Link href={`/clientes/${c.id}`} className="text-white hover:text-[var(--purple-light)]">
                        {c.nombre}
                      </Link>
                      {hist && <span className="ml-2 text-[9px] uppercase bg-[var(--muted)]/20 text-[var(--muted)] px-1.5 py-0.5 rounded">hist</span>}
                    </td>
                    <td className="py-2 px-2 text-xs text-[var(--muted)]">{PROGRAMA_LABELS[c.programa || ""] || c.programa || "—"}</td>
                    <td className="py-2 px-2 text-xs text-[var(--muted)]">{c.fecha_onboarding?.split("T")[0] || "—"}</td>
                    <td className={`py-2 px-2 text-right text-xs ${dayColor}`}>
                      {days === null ? "—" : days < 0 ? `-${Math.abs(days)}d` : `${days}d`}
                    </td>
                    <td className="py-2 px-2">
                      <select disabled={dis} value={c.estado} onChange={(e) => patch(c.id, "estado", e.target.value)}
                        className="bg-[var(--background)] border border-[var(--card-border)] rounded px-1 py-0.5 text-[11px] text-white">
                        {ESTADOS.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <select disabled={dis} value={c.estado_contacto} onChange={(e) => patch(c.id, "estado_contacto", e.target.value)}
                        className="bg-[var(--background)] border border-[var(--card-border)] rounded px-1 py-0.5 text-[11px] text-white">
                        {ESTADOS_CONTACTO.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button disabled={dis} onClick={() => patch(c.id, "exito", !c.exito)}
                        className={`text-xs px-2 py-0.5 rounded ${c.exito ? "bg-[var(--green)] text-white" : "bg-white/5 text-[var(--muted)]"}`}>
                        {c.exito ? "✅" : "—"}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button disabled={dis} onClick={() => patch(c.id, "pesadilla", !c.pesadilla)}
                        className={`text-xs px-2 py-0.5 rounded ${c.pesadilla ? "bg-[var(--red)] text-white" : "bg-white/5 text-[var(--muted)]"}`}>
                        {c.pesadilla ? "⚠️" : "—"}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right text-xs text-[var(--muted)]">
                      {(c.deudor_usd || 0) > 0 ? formatUSD(c.deudor_usd) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group align-middle ml-1">
      <span className="cursor-help text-[var(--muted)] hover:text-white text-[10px] border border-[var(--muted)]/50 rounded-full w-4 h-4 inline-flex items-center justify-center leading-none">i</span>
      <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 top-full mt-1 w-64 z-50 bg-[var(--background)] border border-[var(--card-border)] rounded-md p-2 text-[11px] text-white normal-case tracking-normal font-normal shadow-lg whitespace-pre-line">
        {text}
      </span>
    </span>
  );
}

function KPI({ label, value, sub, color, help }: { label: string; value: string; sub?: string; color: string; help?: string }) {
  const colorMap: Record<string, string> = {
    green: "text-[var(--green)]", red: "text-[var(--red)]",
    purple: "text-[var(--purple-light)]", white: "text-white",
  };
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <p className="text-xs text-[var(--muted)] uppercase tracking-wide flex items-center">
        {label}
        {help && <InfoTip text={help} />}
      </p>
      <p className={`text-2xl font-bold ${colorMap[color] || "text-white"} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}
