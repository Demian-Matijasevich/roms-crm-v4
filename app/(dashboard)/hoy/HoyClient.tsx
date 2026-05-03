"use client";

import { useState, useMemo } from "react";

interface Lead {
  id: string;
  nombre: string;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: string;
  closer_id: string | null;
  setter_id: string | null;
  fuente: string | null;
  utm_source: string | null;
  utm_medium: string | null;
}

interface TeamMember {
  id: string;
  nombre: string;
  is_closer: boolean;
  is_setter: boolean;
}

interface Campaign {
  medium: string | null;
  setter_id: string | null;
}

interface Props {
  leads: Lead[];
  team: TeamMember[];
  campaigns: Campaign[];
}

type Origen = "outbound" | "inbound" | "landing";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function HoyClient({ leads, team, campaigns }: Props) {
  const [date, setDate] = useState<string>(todayStr());

  const mediumToSetter = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaigns) if (c.setter_id && c.medium) m.set(c.medium.toLowerCase(), c.setter_id);
    return m;
  }, [campaigns]);

  const teamById = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);

  // Classify a lead's origen
  // Prioridad: utm_medium (inbound) > setter_id solo (outbound) > landing
  function classify(l: Lead): { origen: Origen; setterId: string | null } {
    if (l.utm_medium) {
      const sid = mediumToSetter.get(l.utm_medium.toLowerCase().trim()) || null;
      return { origen: "inbound", setterId: sid || l.setter_id };
    }
    if (l.setter_id) {
      return { origen: "outbound", setterId: l.setter_id };
    }
    return { origen: "landing", setterId: null };
  }

  // Filter leads of the day (by fecha_agendado or fecha_llamada)
  // Excluyo cancelada y reprogramada (no son agendas reales)
  const dayLeads = useMemo(() => {
    return leads.filter((l) => {
      if (l.estado === "cancelada" || l.estado === "reprogramada") return false;
      const f = (l.fecha_agendado || l.fecha_llamada || "").split("T")[0];
      return f === date;
    });
  }, [leads, date]);

  // ─── General totals ───
  const totals = useMemo(() => {
    let outbound = 0, inbound = 0, landing = 0;
    for (const l of dayLeads) {
      const { origen } = classify(l);
      if (origen === "outbound") outbound++;
      else if (origen === "inbound") inbound++;
      else landing++;
    }
    return { outbound, inbound, landing, total: dayLeads.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayLeads]);

  // ─── Por setter ───
  const bySetter = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; outbound: number; inbound: number; landing: number; total: number }>();
    for (const t of team) {
      if (!t.is_setter) continue;
      map.set(t.id, { id: t.id, nombre: t.nombre, outbound: 0, inbound: 0, landing: 0, total: 0 });
    }
    let unassignedLanding = 0;
    let unassignedInbound = 0;
    for (const l of dayLeads) {
      const { origen, setterId } = classify(l);
      if (origen === "landing" && !setterId) {
        unassignedLanding++;
        continue;
      }
      if (origen === "inbound" && !setterId) {
        unassignedInbound++;
        continue;
      }
      if (!setterId) continue;
      const entry = map.get(setterId);
      if (!entry) continue;
      entry[origen]++;
      entry.total++;
    }
    return {
      rows: Array.from(map.values())
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total),
      unassignedLanding,
      unassignedInbound,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayLeads, team]);

  // ─── Por closer ───
  const byCloser = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; outbound: number; inbound: number; landing: number; total: number }>();
    for (const t of team) {
      if (!t.is_closer) continue;
      map.set(t.id, { id: t.id, nombre: t.nombre, outbound: 0, inbound: 0, landing: 0, total: 0 });
    }
    let sinCloser = 0;
    for (const l of dayLeads) {
      if (!l.closer_id) {
        sinCloser++;
        continue;
      }
      const entry = map.get(l.closer_id);
      if (!entry) continue;
      const { origen } = classify(l);
      entry[origen]++;
      entry.total++;
    }
    return {
      rows: Array.from(map.values())
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total),
      sinCloser,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayLeads, team]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Actividad del día</h1>
          <p className="text-sm text-[var(--muted)]">
            Agendas + Llamadas — outbound (setter directo) · inbound (UTM medium) · landing (sin UTM)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(todayStr())}
            className="text-xs bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-3 py-1.5 rounded-lg">
            Hoy
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white" />
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total" value={totals.total} color="white" />
        <Card label="Outbound" value={totals.outbound} color="orange"
          help="Setter prospectó manualmente (lead.setter_id está asignado y no viene por utm_medium)" />
        <Card label="Inbound" value={totals.inbound} color="blue"
          help="Vino por UTM medium del setter (lead.utm_medium → campaign del setter)" />
        <Card label="Landing" value={totals.landing} color="purple"
          help="Sin setter ni utm_medium — vino por la página directa" />
      </div>

      {/* Por setter */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Por setter</h2>
        {bySetter.rows.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">Sin agendas con setter asignado en este día</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="py-2 px-2">Setter</th>
                  <th className="py-2 px-2 text-right">Outbound</th>
                  <th className="py-2 px-2 text-right">Inbound</th>
                  <th className="py-2 px-2 text-right">Landing</th>
                  <th className="py-2 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {bySetter.rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-2 text-white font-medium">{r.nombre}</td>
                    <td className="py-2 px-2 text-right text-orange-400">{r.outbound}</td>
                    <td className="py-2 px-2 text-right text-blue-400">{r.inbound}</td>
                    <td className="py-2 px-2 text-right text-[var(--purple-light)]">{r.landing}</td>
                    <td className="py-2 px-2 text-right text-white font-bold">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(bySetter.unassignedLanding > 0 || bySetter.unassignedInbound > 0) && (
          <p className="text-xs text-[var(--muted)] mt-3">
            Sin setter asignado: {bySetter.unassignedLanding} landing · {bySetter.unassignedInbound} inbound (utm_medium sin match)
          </p>
        )}
      </div>

      {/* Por closer */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Por closer</h2>
        {byCloser.rows.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">Sin agendas con closer asignado en este día</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="py-2 px-2">Closer</th>
                  <th className="py-2 px-2 text-right">Outbound</th>
                  <th className="py-2 px-2 text-right">Inbound</th>
                  <th className="py-2 px-2 text-right">Landing</th>
                  <th className="py-2 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {byCloser.rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-2 text-white font-medium">{r.nombre}</td>
                    <td className="py-2 px-2 text-right text-orange-400">{r.outbound}</td>
                    <td className="py-2 px-2 text-right text-blue-400">{r.inbound}</td>
                    <td className="py-2 px-2 text-right text-[var(--purple-light)]">{r.landing}</td>
                    <td className="py-2 px-2 text-right text-white font-bold">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {byCloser.sinCloser > 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            Sin closer asignado: {byCloser.sinCloser}
          </p>
        )}
      </div>

      {/* Lista de leads */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Detalle ({dayLeads.length})</h2>
        {dayLeads.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">Sin leads en este día</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="py-2 px-2">Lead</th>
                  <th className="py-2 px-2">Origen</th>
                  <th className="py-2 px-2">Setter</th>
                  <th className="py-2 px-2">Closer</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 px-2">Fuente / UTM</th>
                </tr>
              </thead>
              <tbody>
                {dayLeads.map((l) => {
                  const { origen, setterId } = classify(l);
                  const setterName = setterId ? teamById.get(setterId)?.nombre || "?" : "—";
                  const closerName = l.closer_id ? teamById.get(l.closer_id)?.nombre || "?" : "—";
                  const colorMap: Record<Origen, string> = {
                    outbound: "bg-orange-400/20 text-orange-400",
                    inbound: "bg-blue-400/20 text-blue-400",
                    landing: "bg-[var(--purple)]/20 text-[var(--purple-light)]",
                  };
                  return (
                    <tr key={l.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                      <td className="py-2 px-2 text-white">{l.nombre}</td>
                      <td className="py-2 px-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${colorMap[origen]}`}>
                          {origen}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-[var(--muted)] text-xs">{setterName}</td>
                      <td className="py-2 px-2 text-[var(--muted)] text-xs">{closerName}</td>
                      <td className="py-2 px-2 text-[var(--muted)] text-xs">{l.estado}</td>
                      <td className="py-2 px-2 text-[var(--muted)] text-xs">
                        {l.fuente || l.utm_source || "—"}
                        {l.utm_medium && <span className="ml-1 text-[10px]">· {l.utm_medium}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, color, help }: { label: string; value: number; color: string; help?: string }) {
  const colorMap: Record<string, string> = {
    white: "text-white",
    orange: "text-orange-400",
    blue: "text-blue-400",
    purple: "text-[var(--purple-light)]",
  };
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4" title={help}>
      <p className="text-xs text-[var(--muted)] uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${colorMap[color]} mt-1`}>{value}</p>
      {help && <p className="text-[10px] text-[var(--muted)] mt-1">{help}</p>}
    </div>
  );
}
