"use client";

import { useMemo, useState } from "react";
import { formatUSD } from "@/lib/format";
import type { ClientLite, RenewalLite } from "./page";

interface Props {
  clients: ClientLite[];
  renewals: RenewalLite[];
}

const PROGRAMA_LABELS: Record<string, string> = {
  roms_7: "ROMS 7",
  consultoria: "Consultoría",
  omnipresencia: "Omnipresencia",
  multicuentas: "Multicuentas",
};

const RENOVA_OK = new Set(["pago", "cuota_1_pagada", "cuota_2_pagada"]);
const NO_RENUEVA_STATES = new Set(["no_renueva", "retirar_acceso", "broke_cancelado"]);

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function MetricasClientesClient({ clients, renewals }: Props) {
  const [filterPrograma, setFilterPrograma] = useState<string>("todos");

  const filtered = useMemo(() => {
    if (filterPrograma === "todos") return clients;
    return clients.filter((c) => c.programa === filterPrograma);
  }, [clients, filterPrograma]);

  // ─── KPIs principales ───
  const total = filtered.length;
  const activos = filtered.filter((c) => c.estado === "activo").length;
  const inactivos = filtered.filter((c) => c.estado === "inactivo").length;
  const pausados = filtered.filter((c) => c.estado === "pausado").length;

  // Clientes que terminaron su programa (fecha_offboarding seteada o tiempo cumplido)
  const today = new Date();
  const terminaron = filtered.filter((c) => {
    if (c.fecha_offboarding) return true;
    if (!c.fecha_onboarding) return false;
    const onb = new Date(c.fecha_onboarding);
    const end = new Date(onb.getTime() + c.total_dias_programa * 86400000);
    return end < today;
  });

  // Tasa de renovación: de los que terminaron, cuántos tienen renewal_history con estado de pago
  const clientIdsWithRenewal = new Set(renewals.filter((r) => r.estado && RENOVA_OK.has(r.estado)).map((r) => r.client_id));
  const renovaron = terminaron.filter((c) => clientIdsWithRenewal.has(c.id)).length;
  const tasaRenovacion = terminaron.length > 0 ? renovaron / terminaron.length : 0;

  // Churn rate: de los que terminaron, cuántos NO renovaron (estado_contacto = no_renueva o retirar_acceso o broke_cancelado, o no tienen renewal)
  const churnedSet = new Set<string>();
  for (const c of terminaron) {
    if (NO_RENUEVA_STATES.has(c.estado_contacto)) churnedSet.add(c.id);
    if (c.estado === "inactivo" && !clientIdsWithRenewal.has(c.id)) churnedSet.add(c.id);
    if (!clientIdsWithRenewal.has(c.id) && c.fecha_offboarding) churnedSet.add(c.id);
  }
  const churned = churnedSet.size;
  const churnRate = terminaron.length > 0 ? churned / terminaron.length : 0;

  // Tasa de éxito: de los activos + terminaron, % con exito=true
  const conExito = filtered.filter((c) => c.exito).length;
  const pesadilla = filtered.filter((c) => c.pesadilla).length;
  const tasaExito = total > 0 ? conExito / total : 0;

  // Clientes onboarding por mes
  const onboardingByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filtered) {
      if (!c.fecha_onboarding) continue;
      const ym = c.fecha_onboarding.split("T")[0].substring(0, 7);
      map.set(ym, (map.get(ym) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Cohort retention: por mes de onboarding, % que sigue activo
  const cohortRetention = useMemo(() => {
    const buckets = new Map<string, { total: number; activos: number; renovaron: number }>();
    for (const c of filtered) {
      if (!c.fecha_onboarding) continue;
      const ym = c.fecha_onboarding.split("T")[0].substring(0, 7);
      if (!buckets.has(ym)) buckets.set(ym, { total: 0, activos: 0, renovaron: 0 });
      const b = buckets.get(ym)!;
      b.total++;
      if (c.estado === "activo") b.activos++;
      if (clientIdsWithRenewal.has(c.id)) b.renovaron++;
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, b]) => ({
        mes: ym,
        total: b.total,
        activos: b.activos,
        renovaron: b.renovaron,
        retencion_pct: b.total > 0 ? b.activos / b.total : 0,
        renovacion_pct: b.total > 0 ? b.renovaron / b.total : 0,
      }));
  }, [filtered, clientIdsWithRenewal]);

  const programas = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) if (c.programa) set.add(c.programa);
    return [...set];
  }, [clients]);

  // Programa breakdown
  const porPrograma = useMemo(() => {
    const map = new Map<string, { total: number; activos: number; conExito: number; renovaron: number }>();
    for (const c of filtered) {
      const p = c.programa || "sin_programa";
      if (!map.has(p)) map.set(p, { total: 0, activos: 0, conExito: 0, renovaron: 0 });
      const b = map.get(p)!;
      b.total++;
      if (c.estado === "activo") b.activos++;
      if (c.exito) b.conExito++;
      if (clientIdsWithRenewal.has(c.id)) b.renovaron++;
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [filtered, clientIdsWithRenewal]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Métricas de Clientes</h1>
          <p className="text-sm text-[var(--muted)]">Renovación · Churn · Éxito · Cohort por mes</p>
        </div>
        <select value={filterPrograma} onChange={(e) => setFilterPrograma(e.target.value)}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white">
          <option value="todos">Todos los programas</option>
          {programas.map((p) => (<option key={p} value={p}>{PROGRAMA_LABELS[p] || p}</option>))}
        </select>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total clientes" value={total.toString()} sub={`${activos} activos · ${inactivos} inactivos · ${pausados} pausados`} color="white" />
        <KPI label="Tasa de renovación" value={fmtPct(tasaRenovacion)} sub={`${renovaron} de ${terminaron.length} terminaron`} color="green" />
        <KPI label="Churn rate" value={fmtPct(churnRate)} sub={`${churned} de ${terminaron.length} terminaron`} color="red" />
        <KPI label="Tasa de éxito" value={fmtPct(tasaExito)} sub={`${conExito} con éxito · ${pesadilla} pesadilla`} color="purple" />
      </div>

      {/* Onboarding por mes */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Clientes nuevos por mes (onboarding)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="py-2 px-2">Mes</th>
                <th className="py-2 px-2 text-right">Onboarding</th>
                <th className="py-2 px-2 text-right">Activos hoy</th>
                <th className="py-2 px-2 text-right">% Retención</th>
                <th className="py-2 px-2 text-right">Renovaron</th>
                <th className="py-2 px-2 text-right">% Renovación</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por programa */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Por programa</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="py-2 px-2">Programa</th>
                <th className="py-2 px-2 text-right">Total</th>
                <th className="py-2 px-2 text-right">Activos</th>
                <th className="py-2 px-2 text-right">Con éxito</th>
                <th className="py-2 px-2 text-right">% Éxito</th>
                <th className="py-2 px-2 text-right">Renovaron</th>
                <th className="py-2 px-2 text-right">% Renov.</th>
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
                  <td className="py-2 px-2 text-right text-[var(--purple-light)]">{b.renovaron}</td>
                  <td className="py-2 px-2 text-right text-[var(--muted)]">{fmtPct(b.total > 0 ? b.renovaron / b.total : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renovaciones detalle */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Renovaciones registradas ({renewals.length})</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[var(--muted)] text-xs">Total</p>
            <p className="text-2xl font-bold text-white">{renewals.length}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">Pagas</p>
            <p className="text-2xl font-bold text-[var(--green)]">{renewals.filter((r) => r.estado && RENOVA_OK.has(r.estado)).length}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">Revenue total</p>
            <p className="text-2xl font-bold text-[var(--green)]">{formatUSD(renewals.reduce((s, r) => s + (r.monto_total || 0), 0))}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] text-xs">Ticket promedio</p>
            <p className="text-2xl font-bold text-white">{renewals.length > 0 ? formatUSD(renewals.reduce((s, r) => s + (r.monto_total || 0), 0) / renewals.length) : "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colorMap: Record<string, string> = {
    green: "text-[var(--green)]",
    red: "text-[var(--red)]",
    purple: "text-[var(--purple-light)]",
    white: "text-white",
  };
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <p className="text-xs text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color] || "text-white"} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}
