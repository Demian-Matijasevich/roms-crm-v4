"use client";

import { useState, useMemo } from "react";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD } from "@/lib/format";
import { getFiscalStart, getFiscalEnd, parseLocalDate } from "@/lib/date-utils";
import type { Lead, Payment, RenewalHistory, TeamMember } from "@/lib/types";

interface Props {
  leads: Lead[];
  payments: Payment[];
  renewals: RenewalHistory[];
  team: TeamMember[];
}

interface FunnelStep {
  label: string;
  count: number;
  pct: number;
  dropRate: number | null;
}

export default function FunnelClient({ leads, payments, renewals, team }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );
  const [closerFilter, setCloserFilter] = useState("all");
  const [setterFilter, setSetterFilter] = useState("all");

  const closers = team.filter((t) => t.is_closer);
  const setters = team.filter((t) => t.is_setter);

  const funnel = useMemo(() => {
    const d = parseLocalDate(selectedMonth);
    const start = getFiscalStart(d);
    const end = getFiscalEnd(d);

    // Filter leads by fiscal period + closer/setter
    let filteredLeads = leads.filter((l) => {
      const dateStr = l.fecha_llamada || l.fecha_agendado;
      if (!dateStr) return false;
      const ld = parseLocalDate(dateStr.split("T")[0]);
      return ld >= start && ld <= end;
    });

    if (closerFilter !== "all") {
      filteredLeads = filteredLeads.filter((l) => l.closer_id === closerFilter);
    }
    if (setterFilter !== "all") {
      filteredLeads = filteredLeads.filter((l) => l.setter_id === setterFilter);
    }

    const leadIds = new Set(filteredLeads.map((l) => l.id));

    // 1. Leads generados
    const totalLeads = filteredLeads.length;

    // 2. Se presentaron
    const presentados = filteredLeads.filter(
      (l) =>
        l.estado !== "pendiente" &&
        l.estado !== "no_show" &&
        l.estado !== "cancelada"
    ).length;

    // 3. Calificados
    const calificados = filteredLeads.filter(
      (l) => l.lead_calificado === "calificado"
    ).length;

    // 4. Cerrados
    const cerrados = filteredLeads.filter(
      (l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento"
    ).length;

    // 5. Pagaron cuota 1
    const cuota1Pagados = payments.filter(
      (p) =>
        p.lead_id &&
        leadIds.has(p.lead_id) &&
        p.numero_cuota === 1 &&
        p.estado === "pagado"
    ).length;

    // 6. Pagaron cuota 2
    const cuota2Pagados = payments.filter(
      (p) =>
        p.lead_id &&
        leadIds.has(p.lead_id) &&
        p.numero_cuota === 2 &&
        p.estado === "pagado"
    ).length;

    // 7. Renovaron
    const renovaron = renewals.filter((r) => r.estado === "pago").length;

    const steps: FunnelStep[] = [];
    const raw = [
      { label: "Leads generados", count: totalLeads },
      { label: "Se presentaron", count: presentados },
      { label: "Calificados", count: calificados },
      { label: "Cerrados", count: cerrados },
      { label: "Pagaron cuota 1", count: cuota1Pagados },
      { label: "Pagaron cuota 2", count: cuota2Pagados },
      { label: "Renovaron", count: renovaron },
    ];

    for (let i = 0; i < raw.length; i++) {
      const pct = totalLeads > 0 ? (raw[i].count / totalLeads) * 100 : 0;
      const dropRate =
        i > 0 && raw[i - 1].count > 0
          ? ((raw[i - 1].count - raw[i].count) / raw[i - 1].count) * 100
          : null;
      steps.push({ ...raw[i], pct, dropRate });
    }

    return steps;
  }, [leads, payments, renewals, selectedMonth, closerFilter, setterFilter]);

  const maxCount = funnel.length > 0 ? funnel[0].count : 1;

  const stepColors = [
    "bg-blue-500",
    "bg-blue-400",
    "bg-cyan-400",
    "bg-[var(--green)]",
    "bg-emerald-400",
    "bg-teal-400",
    "bg-[var(--purple)]",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Funnel de Conversion</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Pipeline completo de lead a renovacion
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
          <select
            value={closerFilter}
            onChange={(e) => setCloserFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          >
            <option value="all">Todos los closers</option>
            {closers.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select
            value={setterFilter}
            onChange={(e) => setSetterFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          >
            <option value="all">Todos los setters</option>
            {setters.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Funnel Visual */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-3">
        {funnel.map((step, i) => {
          const widthPct = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 4) : 4;

          return (
            <div key={step.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white font-medium">{step.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">{step.count}</span>
                  <span className="text-[var(--muted)] text-xs w-12 text-right">
                    {step.pct.toFixed(1)}%
                  </span>
                  {step.dropRate !== null && (
                    <span className="text-[var(--red)] text-xs w-16 text-right">
                      -{step.dropRate.toFixed(0)}% drop
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full bg-white/5 rounded-full h-8 overflow-hidden">
                <div
                  className={`h-full rounded-full ${stepColors[i] || "bg-[var(--purple)]"} transition-all duration-500 flex items-center justify-end pr-2`}
                  style={{ width: `${widthPct}%` }}
                >
                  {widthPct > 15 && (
                    <span className="text-xs font-bold text-white/90">{step.count}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion rates summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {funnel.length >= 4 && (
          <>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <span className="text-xs text-[var(--muted)] uppercase">Show Up Rate</span>
              <p className="text-2xl font-bold text-white mt-1">
                {funnel[0].count > 0
                  ? ((funnel[1].count / funnel[0].count) * 100).toFixed(1)
                  : "0"}%
              </p>
              <p className="text-xs text-[var(--muted)]">
                {funnel[1].count} de {funnel[0].count}
              </p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <span className="text-xs text-[var(--muted)] uppercase">Calificacion Rate</span>
              <p className="text-2xl font-bold text-white mt-1">
                {funnel[1].count > 0
                  ? ((funnel[2].count / funnel[1].count) * 100).toFixed(1)
                  : "0"}%
              </p>
              <p className="text-xs text-[var(--muted)]">
                {funnel[2].count} de {funnel[1].count}
              </p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <span className="text-xs text-[var(--muted)] uppercase">Cierre Rate</span>
              <p className="text-2xl font-bold text-[var(--green)] mt-1">
                {funnel[2].count > 0
                  ? ((funnel[3].count / funnel[2].count) * 100).toFixed(1)
                  : "0"}%
              </p>
              <p className="text-xs text-[var(--muted)]">
                {funnel[3].count} de {funnel[2].count}
              </p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
              <span className="text-xs text-[var(--muted)] uppercase">Lead to Close</span>
              <p className="text-2xl font-bold text-[var(--purple-light)] mt-1">
                {funnel[0].count > 0
                  ? ((funnel[3].count / funnel[0].count) * 100).toFixed(1)
                  : "0"}%
              </p>
              <p className="text-xs text-[var(--muted)]">
                {funnel[3].count} de {funnel[0].count}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
