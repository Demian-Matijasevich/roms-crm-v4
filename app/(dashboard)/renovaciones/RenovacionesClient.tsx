"use client";

import { useState, useMemo } from "react";
import type { AuthSession, RenewalQueueRow } from "@/lib/types";

interface RenewalHistoryItem {
  id: string;
  client_id: string;
  tipo_renovacion: string | null;
  programa_anterior: string | null;
  programa_nuevo: string | null;
  monto_total: number;
  plan_pago: string | null;
  estado: string | null;
  fecha_renovacion: string | null;
  client?: { id: string; nombre: string; programa: string | null };
  responsable?: { id: string; nombre: string };
}

interface Metrics {
  tasaRenovacion: number;
  revenuePromedio: number;
  churnRate: number;
  totalRevenue: number;
  renewedCount: number;
  expiredCount: number;
  tasaRenovacionMes: number;
  churnRateMes: number;
  renewedThisMonth: number;
  expiredThisMonth: number;
}

interface Props {
  renewalQueue: RenewalQueueRow[];
  renewalHistory: RenewalHistoryItem[];
  metrics: Metrics;
  session: AuthSession;
}

type Tab = "queue" | "historial";

export default function RenovacionesClient({
  renewalQueue,
  renewalHistory,
  metrics,
  session,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("queue");
  const [search, setSearch] = useState("");
  const [filterSemaforo, setFilterSemaforo] = useState<string>("todos");
  const [showRenewalForm, setShowRenewalForm] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [localHistory, setLocalHistory] = useState<RenewalHistoryItem[]>(renewalHistory);
  const [histSearch, setHistSearch] = useState("");
  const [histEstado, setHistEstado] = useState("todos");

  async function updateRenewal(id: string, field: string, value: string | number | null) {
    try {
      const res = await fetch("/api/renewals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocalHistory((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deleteRenewal(id: string, nombre: string) {
    if (!confirm(`Borrar renovación de ${nombre}?`)) return;
    const res = await fetch(`/api/renewals?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setLocalHistory((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert("Error: " + (json.error || "desconocido"));
    }
  }

  const filteredHistory = useMemo(() => {
    let arr = localHistory;
    if (histEstado !== "todos") arr = arr.filter((r) => (r.estado || "") === histEstado);
    if (histSearch) {
      const q = histSearch.toLowerCase();
      arr = arr.filter((r) =>
        (r.client?.nombre || "").toLowerCase().includes(q) ||
        (r.tipo_renovacion || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [localHistory, histEstado, histSearch]);

  const filteredQueue = useMemo(() => {
    let items = [...renewalQueue];
    if (filterSemaforo !== "todos") {
      items = items.filter((i) => i.semaforo === filterSemaforo);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter((i) => i.nombre.toLowerCase().includes(s));
    }
    return items;
  }, [renewalQueue, filterSemaforo, search]);

  function getPredictionBadge(item: RenewalQueueRow) {
    if (item.health_score >= 70) {
      return (
        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium">
          Alta probabilidad
        </span>
      );
    }
    if (item.health_score < 50) {
      return (
        <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-medium">
          Riesgo churn
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 bg-white/10 text-gray-200 rounded-full font-medium">
        Media
      </span>
    );
  }

  function getSemaforoEmoji(s: string) {
    if (s === "vencido") return "\u{1F534}";
    if (s === "urgente") return "\u{1F7E1}";
    if (s === "proximo") return "\u{1F7E0}";
    return "\u{1F7E2}";
  }

  return (
    <div className="space-y-6">
      {/* Metrics — mensual y global separados */}
      <div>
        <p className="text-xs uppercase text-[var(--muted)] mb-2 tracking-wide">📅 Este mes</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <p className="text-sm text-[var(--muted)]">Tasa renovación (mes)</p>
            <p className="text-2xl font-bold text-green-400">{metrics.tasaRenovacionMes}%</p>
            <p className="text-xs text-[var(--muted)]">{metrics.renewedThisMonth}/{metrics.expiredThisMonth} vencen este mes</p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <p className="text-sm text-[var(--muted)]">Churn rate (mes)</p>
            <p className="text-2xl font-bold text-red-400">{metrics.churnRateMes}%</p>
            <p className="text-xs text-[var(--muted)]">{metrics.expiredThisMonth - metrics.renewedThisMonth} no renovaron</p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <p className="text-sm text-[var(--muted)]">Revenue total renovaciones</p>
            <p className="text-2xl font-bold text-blue-400">${metrics.totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted)]">acumulado histórico</p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <p className="text-sm text-[var(--muted)]">Revenue por renov</p>
            <p className="text-2xl font-bold text-white">${metrics.revenuePromedio.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted)]">promedio</p>
          </div>
        </div>
        <p className="text-xs uppercase text-[var(--muted)] mb-2 tracking-wide">📊 Global (histórico)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)]/50 rounded-xl p-4">
            <p className="text-sm text-[var(--muted)]">Tasa renovación global</p>
            <p className="text-xl font-bold text-green-400">{metrics.tasaRenovacion}%</p>
            <p className="text-xs text-[var(--muted)]">{metrics.renewedCount}/{metrics.expiredCount} históricos</p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)]/50 rounded-xl p-4">
            <p className="text-sm text-[var(--muted)]">Churn rate global</p>
            <p className="text-xl font-bold text-red-400">{metrics.churnRate}%</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--card-border)]">
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "queue"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-[var(--muted)] hover:text-gray-200"
          }`}
        >
          Cola de renovaciones ({renewalQueue.length})
        </button>
        <button
          onClick={() => setActiveTab("historial")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "historial"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-[var(--muted)] hover:text-gray-200"
          }`}
        >
          Historial ({renewalHistory.length})
        </button>
      </div>

      {activeTab === "queue" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white w-64 placeholder-[var(--muted)]"
            />
            <select
              value={filterSemaforo}
              onChange={(e) => setFilterSemaforo(e.target.value)}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="todos">Todos</option>
              <option value="vencido">Vencidos</option>
              <option value="urgente">Urgentes</option>
              <option value="proximo">Proximos</option>
              <option value="ok">Al dia</option>
            </select>
          </div>

          {/* Queue Table */}
          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Estado</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Cliente</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Programa</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Vencimiento</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Dias</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Health</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Prediccion</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Contacto</th>
                    <th className="px-4 py-3 font-medium text-[var(--muted)]">Acciones</th>
                  </tr>
                </thead>
                {filteredQueue.map((item) => (
                  <tbody key={item.id} className="divide-y divide-[var(--card-border)]">
                    <tr
                      className={`hover:bg-white/5 cursor-pointer ${
                        item.semaforo === "vencido" ? "bg-red-500/10" : ""
                      }`}
                      onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                    >
                      <td className="px-4 py-3">
                        {getSemaforoEmoji(item.semaforo)}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{item.nombre}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {item.programa}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {item.fecha_vencimiento
                          ? new Date(item.fecha_vencimiento).toLocaleDateString(
                              "es-AR"
                            )
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            item.dias_restantes < 0
                              ? "text-red-400"
                              : item.dias_restantes <= 7
                              ? "text-yellow-400"
                              : "text-green-400"
                          }`}
                        >
                          {item.dias_restantes < 0
                            ? `${Math.abs(item.dias_restantes)}d vencido`
                            : `${item.dias_restantes}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-bold ${
                            item.health_score >= 80
                              ? "text-green-400"
                              : item.health_score >= 50
                              ? "text-yellow-400"
                              : "text-red-400"
                          }`}
                        >
                          {item.health_score}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {getPredictionBadge(item)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)]">
                        {item.estado_contacto}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() =>
                            setShowRenewalForm(
                              showRenewalForm === item.id ? null : item.id
                            )
                          }
                          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Registrar renovacion
                        </button>
                        {showRenewalForm === item.id && (
                          <RenewalForm
                            clientId={item.id}
                            clientNombre={item.nombre}
                            programaActual={item.programa}
                            sessionMemberId={session.team_member_id}
                            onSuccess={() => {
                              setShowRenewalForm(null);
                              window.location.reload();
                            }}
                            onCancel={() => setShowRenewalForm(null)}
                          />
                        )}
                      </td>
                    </tr>
                    {expandedRow === item.id && (
                      <tr>
                        <td colSpan={9} className="px-4 py-4 bg-white/[0.02]">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-[var(--muted)] uppercase">Info del cliente</h4>
                              <div className="space-y-1 text-sm">
                                <p className="text-white font-medium">{item.nombre}</p>
                                <p className="text-[var(--muted)]">Programa: {item.programa}</p>
                                <p className="text-[var(--muted)]">Onboarding: {item.fecha_onboarding ? new Date(item.fecha_onboarding).toLocaleDateString("es-AR") : "-"}</p>
                                <p className="text-[var(--muted)]">Duracion: {item.total_dias_programa}d</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-[var(--muted)] uppercase">Estado de renovacion</h4>
                              <div className="space-y-1 text-sm">
                                <p className="text-[var(--muted)]">
                                  Vencimiento: {item.fecha_vencimiento ? new Date(item.fecha_vencimiento).toLocaleDateString("es-AR") : "-"}
                                </p>
                                <p className={`font-medium ${
                                  item.dias_restantes < 0 ? "text-red-400" : item.dias_restantes <= 7 ? "text-yellow-400" : "text-green-400"
                                }`}>
                                  {item.dias_restantes < 0 ? `${Math.abs(item.dias_restantes)}d vencido` : `${item.dias_restantes}d restantes`}
                                </p>
                                <p className="text-[var(--muted)]">Contacto: {item.estado_contacto}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-[var(--muted)] uppercase">Health Score</h4>
                              <div className="space-y-1 text-sm">
                                <p className={`text-2xl font-bold ${
                                  item.health_score >= 80 ? "text-green-400" : item.health_score >= 50 ? "text-yellow-400" : "text-red-400"
                                }`}>
                                  {item.health_score}
                                </p>
                                {getPredictionBadge(item)}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
                {filteredQueue.length === 0 && (
                  <tbody>
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center text-[var(--muted)]"
                      >
                        No hay renovaciones en cola
                      </td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "historial" && (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <input type="text" placeholder="Buscar cliente / tipo..." value={histSearch}
              onChange={(e) => setHistSearch(e.target.value)}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white w-64 placeholder-[var(--muted)]" />
            <select value={histEstado} onChange={(e) => setHistEstado(e.target.value)}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-white">
              <option value="todos">Todos los estados</option>
              <option value="pago">Pago</option>
              <option value="no_renueva">No renueva</option>
              <option value="cuota_1_pagada">Cuota 1 pagada</option>
              <option value="cuota_2_pagada">Cuota 2 pagada</option>
            </select>
            <span className="text-xs text-[var(--muted)] ml-auto pb-2">
              {filteredHistory.length} / {localHistory.length}
            </span>
          </div>

          <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-white/5 text-left text-[10px] uppercase">
                  <tr>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[100px]">Fecha</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)]">Cliente</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[110px]">Tipo</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[100px]">Anterior</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[100px]">Nuevo</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] text-right w-[90px]">Monto</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[110px]">Plan</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[120px]">Estado</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)] w-[60px] text-right">Acc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--card-border)]">
                  {filteredHistory.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-[var(--muted)]">Sin historial</td></tr>
                  ) : filteredHistory.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="py-1 px-2">
                        <input type="date" defaultValue={r.fecha_renovacion?.split("T")[0] || ""}
                          onBlur={(e) => { const v = e.target.value || null; if (v !== (r.fecha_renovacion?.split("T")[0] || null)) updateRenewal(r.id, "fecha_renovacion", v); }}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none" />
                      </td>
                      <td className="py-1 px-2 font-medium text-white text-xs">{r.client?.nombre ?? "—"}</td>
                      <td className="py-1 px-2">
                        <select defaultValue={r.tipo_renovacion || ""}
                          onChange={(e) => updateRenewal(r.id, "tipo_renovacion", e.target.value || null)}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                          <option value="">—</option>
                          <option value="resell">resell</option>
                          <option value="upsell_vip">upsell_vip</option>
                          <option value="upsell_meli">upsell_meli</option>
                          <option value="upsell_vip_cuotas">upsell_vip_cuotas</option>
                          <option value="upsell_meli_cuotas">upsell_meli_cuotas</option>
                          <option value="resell_cuotas">resell_cuotas</option>
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <select defaultValue={r.programa_anterior || ""}
                          onChange={(e) => updateRenewal(r.id, "programa_anterior", e.target.value || null)}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                          <option value="">—</option>
                          <option value="roms_7">roms_7</option>
                          <option value="consultoria">consultoria</option>
                          <option value="omnipresencia">omnipresencia</option>
                          <option value="multicuentas">multicuentas</option>
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <select defaultValue={r.programa_nuevo || ""}
                          onChange={(e) => updateRenewal(r.id, "programa_nuevo", e.target.value || null)}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                          <option value="">—</option>
                          <option value="roms_7">roms_7</option>
                          <option value="consultoria">consultoria</option>
                          <option value="omnipresencia">omnipresencia</option>
                          <option value="multicuentas">multicuentas</option>
                        </select>
                      </td>
                      <td className="py-1 px-2 text-right">
                        <input type="number" step={100} defaultValue={r.monto_total || 0}
                          onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== (r.monto_total || 0)) updateRenewal(r.id, "monto_total", v); }}
                          className="w-20 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-right font-medium text-white focus:outline-none" />
                      </td>
                      <td className="py-1 px-2">
                        <select defaultValue={r.plan_pago || ""}
                          onChange={(e) => updateRenewal(r.id, "plan_pago", e.target.value || null)}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                          <option value="">—</option>
                          <option value="paid_in_full">PIF</option>
                          <option value="2_cuotas">2 cuotas</option>
                          <option value="3_cuotas">3 cuotas</option>
                          <option value="personalizado">personalizado</option>
                        </select>
                      </td>
                      <td className="py-1 px-2">
                        <select defaultValue={r.estado || ""}
                          onChange={(e) => updateRenewal(r.id, "estado", e.target.value || null)}
                          className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-[11px] text-[var(--muted)] focus:text-white focus:outline-none">
                          <option value="">—</option>
                          <option value="pago">pago</option>
                          <option value="no_renueva">no_renueva</option>
                          <option value="cuota_1_pagada">cuota_1_pagada</option>
                          <option value="cuota_2_pagada">cuota_2_pagada</option>
                        </select>
                      </td>
                      <td className="py-1 px-2 text-right">
                        <button
                          onClick={() => deleteRenewal(r.id, r.client?.nombre || "")}
                          className="text-[11px] text-[var(--red)] hover:underline"
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ========================================
// RenewalForm -- register a new renewal
// ========================================
function RenewalForm({
  clientId,
  clientNombre,
  programaActual,
  sessionMemberId,
  onSuccess,
  onCancel,
}: {
  clientId: string;
  clientNombre: string;
  programaActual: string;
  sessionMemberId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [tipo, setTipo] = useState("resell");
  const [programaNuevo, setProgramaNuevo] = useState(programaActual);
  const [monto, setMonto] = useState(0);
  const [planPago, setPlanPago] = useState("paid_in_full");
  const [metodo, setMetodo] = useState("binance");
  const [receptor, setReceptor] = useState("Mercado Pago");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Create renewal_history record
      const renewalRes = await fetch("/api/renewals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          tipo_renovacion: tipo,
          programa_anterior: programaActual,
          programa_nuevo: programaNuevo,
          monto_total: monto,
          plan_pago: planPago,
          estado: planPago === "paid_in_full" ? "pago" : "cuota_1_pagada",
          fecha_renovacion: new Date().toISOString().split("T")[0],
          responsable_id: sessionMemberId,
        }),
      });

      if (!renewalRes.ok) throw new Error("Error al crear renovacion");
      const renewal = await renewalRes.json();

      // 2. Create payment record
      const paymentRes = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          renewal_id: renewal.id,
          numero_cuota: 1,
          monto_usd: planPago === "paid_in_full" ? monto : Math.ceil(monto / 2),
          monto_ars: 0,
          fecha_pago: new Date().toISOString().split("T")[0],
          fecha_vencimiento: new Date().toISOString().split("T")[0],
          estado: "pagado",
          metodo_pago: metodo,
          receptor,
          es_renovacion: true,
        }),
      });

      if (paymentRes.ok) {
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-3"
    >
      <p className="text-sm font-medium text-white">
        Renovacion para {clientNombre}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
        >
          <option value="resell">Resell</option>
          <option value="upsell_vip">Upsell VIP</option>
          <option value="upsell_meli">Upsell Meli</option>
          <option value="upsell_vip_cuotas">Upsell VIP Cuotas</option>
          <option value="upsell_meli_cuotas">Upsell Meli Cuotas</option>
          <option value="resell_cuotas">Resell Cuotas</option>
        </select>
        <select
          value={programaNuevo}
          onChange={(e) => setProgramaNuevo(e.target.value)}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
        >
          <option value="roms_7">ROMS 7</option>
          <option value="consultoria">Consultoría</option>
          <option value="omnipresencia">Omnipresencia</option>
          <option value="multicuentas">Multicuentas</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(Number(e.target.value))}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
          placeholder="Monto USD"
        />
        <select
          value={planPago}
          onChange={(e) => setPlanPago(e.target.value)}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
        >
          <option value="paid_in_full">Paid in Full</option>
          <option value="2_cuotas">2 Cuotas</option>
        </select>
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white"
        >
          <option value="mercado_pago">Mercado Pago</option>
          <option value="transferencia">Transferencia</option>
          <option value="cash">Efectivo</option>
          <option value="binance">Binance</option>
          <option value="stripe">Stripe</option>
          <option value="wise">Wise</option>
        </select>
      </div>
      <select
        value={receptor}
        onChange={(e) => setReceptor(e.target.value)}
        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-2 py-1 text-sm text-white w-full"
      >
        <option value="Mercado Pago">Mercado Pago</option>
        <option value="Transferencia">Transferencia</option>
        <option value="Cash">Cash</option>
        <option value="Binance">Binance</option>
        <option value="Stripe">Stripe</option>
        <option value="Wise">Wise</option>
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || monto <= 0}
          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Registrar renovacion"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 bg-white/10 text-[var(--muted)] rounded hover:bg-white/20"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
