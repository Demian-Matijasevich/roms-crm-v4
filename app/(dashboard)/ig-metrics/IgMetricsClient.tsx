"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import KPICard from "@/app/components/KPICard";
import type { IgMetrics } from "@/lib/types";
import { formatUSD } from "@/lib/format";

interface Props {
  metrics: IgMetrics[];
}

// ------- Helpers -------

function delta(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function pct(num: number, den: number): string {
  return den === 0 ? "0.0%" : ((num / den) * 100).toFixed(1) + "%";
}

function deltaTag(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const v = Number(value);
  if (isNaN(v)) return null;
  const color = v >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";
  const arrow = v >= 0 ? "\u25B2" : "\u25BC";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(v).toFixed(1)}%
    </span>
  );
}

// ------- Sub-components -------

function FunnelRow({
  label,
  value,
  rate,
}: {
  label: string;
  value: number;
  rate: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--card-border)]">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <div className="flex items-center gap-4">
        <span className="text-white font-semibold">{value.toLocaleString()}</span>
        {rate && (
          <span className="text-xs text-[var(--purple-light)] w-16 text-right">{rate}</span>
        )}
      </div>
    </div>
  );
}

function RatesTable({
  current,
  previous,
}: {
  current: IgMetrics;
  previous: IgMetrics | null;
}) {
  const er = current.total_seguidores > 0
    ? (current.total_interacciones / current.total_seguidores) * 100
    : 0;
  const erReel = current.reels_publicados > 0
    ? (current.interacciones_reels / current.reels_publicados / (current.total_seguidores || 1)) * 100
    : 0;
  const saveRate = current.reels_publicados > 0
    ? (current.guardados_reels / (current.interacciones_reels || 1)) * 100
    : 0;
  const shareRate = current.reels_publicados > 0
    ? (current.compartidos_reels / (current.interacciones_reels || 1)) * 100
    : 0;
  const alcanceToVisita = pct(current.visitas_perfil, current.cuentas_alcanzadas);
  const visitaToEnlace = pct(current.toques_enlaces, current.visitas_perfil);
  const leadRate = pct(current.leads_ig, current.toques_enlaces);
  const closeRate = pct(current.ventas_ig, current.leads_ig);
  const revPerLead = current.leads_ig > 0 ? current.cash_ig / current.leads_ig : 0;
  const revPer1kAlcance = current.cuentas_alcanzadas > 0
    ? (current.cash_ig / current.cuentas_alcanzadas) * 1000
    : 0;

  const prevEr = previous && previous.total_seguidores > 0
    ? (previous.total_interacciones / previous.total_seguidores) * 100
    : null;

  const rates = [
    { label: "Engagement Rate", value: er.toFixed(2) + "%", prev: prevEr ? prevEr.toFixed(2) + "%" : null },
    { label: "ER/Reel", value: erReel.toFixed(2) + "%", prev: null },
    { label: "Save Rate (reels)", value: saveRate.toFixed(1) + "%", prev: null },
    { label: "Share Rate (reels)", value: shareRate.toFixed(1) + "%", prev: null },
    { label: "Alcance -> Visita", value: alcanceToVisita, prev: null },
    { label: "Visita -> Enlace", value: visitaToEnlace, prev: null },
    { label: "Lead Rate (enlace -> lead)", value: leadRate, prev: null },
    { label: "Close Rate (lead -> venta)", value: closeRate, prev: null },
    { label: "Revenue / Lead", value: formatUSD(revPerLead), prev: null },
    { label: "Revenue / 1K Alcance", value: formatUSD(revPer1kAlcance), prev: null },
  ];

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Rates</h3>
      <div className="space-y-1">
        {rates.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-[var(--card-border)] last:border-0">
            <span className="text-xs text-[var(--muted)]">{r.label}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white font-medium">{r.value}</span>
              {r.prev && (
                <span className="text-xs text-[var(--muted)]">prev: {r.prev}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonTable({
  current,
  previous,
}: {
  current: IgMetrics;
  previous: IgMetrics;
}) {
  const rows = [
    { label: "Alcance", curr: current.cuentas_alcanzadas, prev: previous.cuentas_alcanzadas, storedDelta: current.delta_alcance_pct },
    { label: "Impresiones", curr: current.impresiones, prev: previous.impresiones, storedDelta: current.delta_impresiones_pct },
    { label: "Visitas Perfil", curr: current.visitas_perfil, prev: previous.visitas_perfil, storedDelta: current.delta_visitas_pct },
    { label: "Toques Enlace", curr: current.toques_enlaces, prev: previous.toques_enlaces, storedDelta: current.delta_enlaces_pct },
    { label: "Seguidores Neto", curr: current.nuevos_seguidores - current.unfollows, prev: previous.nuevos_seguidores - previous.unfollows, storedDelta: current.delta_seguidores_pct },
    { label: "Interacciones", curr: current.total_interacciones, prev: previous.total_interacciones, storedDelta: current.delta_interacciones_pct },
    { label: "Reels Int.", curr: current.interacciones_reels, prev: previous.interacciones_reels, storedDelta: current.delta_reels_pct },
    { label: "Posts Int.", curr: Number(current.interacciones_posts ?? 0), prev: Number(previous.interacciones_posts ?? 0), storedDelta: current.delta_posts_pct },
    { label: "Stories Int.", curr: Number(current.interacciones_stories ?? 0), prev: Number(previous.interacciones_stories ?? 0), storedDelta: current.delta_stories_pct },
    { label: "Leads IG", curr: current.leads_ig, prev: previous.leads_ig, storedDelta: null },
    { label: "Ventas IG", curr: current.ventas_ig, prev: previous.ventas_ig, storedDelta: null },
    { label: "Cash IG", curr: current.cash_ig, prev: previous.cash_ig, storedDelta: null },
  ];

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">
        {current.periodo} vs {previous.periodo}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--muted)] text-xs uppercase">
              <th className="text-left py-1">Metrica</th>
              <th className="text-right py-1">{previous.periodo}</th>
              <th className="text-right py-1">{current.periodo}</th>
              <th className="text-right py-1">Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.storedDelta != null ? Number(r.storedDelta) : delta(r.curr, r.prev);
              return (
                <tr key={r.label} className="border-t border-[var(--card-border)]">
                  <td className="py-1.5 text-[var(--muted)]">{r.label}</td>
                  <td className="py-1.5 text-right text-white">{r.prev.toLocaleString()}</td>
                  <td className="py-1.5 text-right text-white font-medium">{r.curr.toLocaleString()}</td>
                  <td className="py-1.5 text-right">
                    {d !== null ? (
                      <span className={`font-medium ${d >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                        {d >= 0 ? "+" : ""}{d.toFixed(1)}%
                      </span>
                    ) : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------- Period Selector -------

function PeriodSelector({
  periods,
  selected,
  onChange,
  label,
}: {
  periods: string[];
  selected: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-[var(--muted)]">{label}</span>}
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none cursor-pointer"
      >
        {periods.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}

// ------- Add Metric Form -------

const INITIAL_FORM = {
  periodo: "",
  fecha_inicio: "",
  fecha_fin: "",
  cuentas_alcanzadas: 0,
  delta_alcance_pct: 0,
  impresiones: 0,
  delta_impresiones_pct: 0,
  visitas_perfil: 0,
  delta_visitas_pct: 0,
  toques_enlaces: 0,
  delta_enlaces_pct: 0,
  pct_alcance_no_seguidores: 0,
  nuevos_seguidores: 0,
  delta_seguidores_pct: 0,
  unfollows: 0,
  total_seguidores: 0,
  total_interacciones: 0,
  delta_interacciones_pct: 0,
  cuentas_interaccion: 0,
  pct_interaccion_no_seguidores: 0,
  reels_publicados: 0,
  interacciones_reels: 0,
  delta_reels_pct: 0,
  likes_reels: 0,
  comentarios_reels: 0,
  compartidos_reels: 0,
  guardados_reels: 0,
  posts_publicados: 0,
  interacciones_posts: 0,
  delta_posts_pct: 0,
  likes_posts: 0,
  comentarios_posts: 0,
  compartidos_posts: 0,
  guardados_posts: 0,
  stories_publicadas: 0,
  interacciones_stories: 0,
  delta_stories_pct: 0,
  respuestas_stories: 0,
  conversaciones_dm: 0,
  pct_hombres: 0,
  pct_mujeres: 0,
  top_paises: "",
  top_ciudades: "",
  top_edades: "",
  leads_ig: 0,
  ventas_ig: 0,
  cash_ig: 0,
};

type FormField = { key: string; label: string; type: "text" | "number" | "date" };

const FORM_SECTIONS: { title: string; fields: FormField[] }[] = [
  {
    title: "General",
    fields: [
      { key: "periodo", label: "Periodo (ej: 'Semana 14')", type: "text" },
      { key: "fecha_inicio", label: "Fecha Inicio", type: "date" },
      { key: "fecha_fin", label: "Fecha Fin", type: "date" },
    ],
  },
  {
    title: "Alcance e Impresiones",
    fields: [
      { key: "cuentas_alcanzadas", label: "Cuentas Alcanzadas", type: "number" },
      { key: "delta_alcance_pct", label: "Delta Alcance %", type: "number" },
      { key: "impresiones", label: "Impresiones", type: "number" },
      { key: "delta_impresiones_pct", label: "Delta Impresiones %", type: "number" },
      { key: "visitas_perfil", label: "Visitas Perfil", type: "number" },
      { key: "delta_visitas_pct", label: "Delta Visitas %", type: "number" },
      { key: "toques_enlaces", label: "Toques Enlace", type: "number" },
      { key: "delta_enlaces_pct", label: "Delta Enlaces %", type: "number" },
      { key: "pct_alcance_no_seguidores", label: "% Alcance No Seguidores", type: "number" },
    ],
  },
  {
    title: "Seguidores",
    fields: [
      { key: "nuevos_seguidores", label: "Nuevos Seguidores", type: "number" },
      { key: "delta_seguidores_pct", label: "Delta Seguidores %", type: "number" },
      { key: "unfollows", label: "Unfollows", type: "number" },
      { key: "total_seguidores", label: "Total Seguidores", type: "number" },
    ],
  },
  {
    title: "Interacciones",
    fields: [
      { key: "total_interacciones", label: "Total Interacciones", type: "number" },
      { key: "delta_interacciones_pct", label: "Delta Interacciones %", type: "number" },
      { key: "cuentas_interaccion", label: "Cuentas que Interactuaron", type: "number" },
      { key: "pct_interaccion_no_seguidores", label: "% Interaccion No Seguidores", type: "number" },
    ],
  },
  {
    title: "Reels",
    fields: [
      { key: "reels_publicados", label: "Reels Publicados", type: "number" },
      { key: "interacciones_reels", label: "Interacciones Reels", type: "number" },
      { key: "delta_reels_pct", label: "Delta Reels %", type: "number" },
      { key: "likes_reels", label: "Likes Reels", type: "number" },
      { key: "comentarios_reels", label: "Comentarios Reels", type: "number" },
      { key: "compartidos_reels", label: "Compartidos Reels", type: "number" },
      { key: "guardados_reels", label: "Guardados Reels", type: "number" },
    ],
  },
  {
    title: "Posts",
    fields: [
      { key: "posts_publicados", label: "Posts Publicados", type: "number" },
      { key: "interacciones_posts", label: "Interacciones Posts", type: "number" },
      { key: "delta_posts_pct", label: "Delta Posts %", type: "number" },
      { key: "likes_posts", label: "Likes Posts", type: "number" },
      { key: "comentarios_posts", label: "Comentarios Posts", type: "number" },
      { key: "compartidos_posts", label: "Compartidos Posts", type: "number" },
      { key: "guardados_posts", label: "Guardados Posts", type: "number" },
    ],
  },
  {
    title: "Stories",
    fields: [
      { key: "stories_publicadas", label: "Stories Publicadas", type: "number" },
      { key: "interacciones_stories", label: "Interacciones Stories", type: "number" },
      { key: "delta_stories_pct", label: "Delta Stories %", type: "number" },
      { key: "respuestas_stories", label: "Respuestas Stories", type: "number" },
    ],
  },
  {
    title: "DMs y Demograficos",
    fields: [
      { key: "conversaciones_dm", label: "Conversaciones DM", type: "number" },
      { key: "pct_hombres", label: "% Hombres", type: "number" },
      { key: "pct_mujeres", label: "% Mujeres", type: "number" },
      { key: "top_paises", label: "Top Paises", type: "text" },
      { key: "top_ciudades", label: "Top Ciudades", type: "text" },
      { key: "top_edades", label: "Top Edades", type: "text" },
    ],
  },
  {
    title: "Business (IG -> Ventas)",
    fields: [
      { key: "leads_ig", label: "Leads desde IG", type: "number" },
      { key: "ventas_ig", label: "Ventas desde IG", type: "number" },
      { key: "cash_ig", label: "Cash desde IG (USD)", type: "number" },
    ],
  },
];

function AddMetricForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateField(key: string, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ig-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      setForm(INITIAL_FORM);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {FORM_SECTIONS.map((section) => (
        <div key={section.title}>
          <h4 className="text-xs uppercase text-[var(--muted)] font-semibold mb-2">
            {section.title}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {section.fields.map((f) => (
              <div key={f.key}>
                <label className="text-xs text-[var(--muted)] block mb-1">{f.label}</label>
                <input
                  type={f.type}
                  value={(form as Record<string, unknown>)[f.key] as string | number}
                  onChange={(e) =>
                    updateField(
                      f.key,
                      f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value
                    )
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-[var(--red)] text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white font-semibold disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
      >
        {loading ? "Guardando..." : "Guardar Metricas IG"}
      </button>
    </form>
  );
}

// ------- Chart Colors -------

const CHART_COLORS = {
  alcance: "#8b5cf6",
  impresiones: "#a78bfa",
  seguidores: "#22c55e",
  nuevos: "#3b82f6",
  unfollows: "#ef4444",
  reels: "#8b5cf6",
  posts: "#3b82f6",
  stories: "#eab308",
};

// ------- Tabs -------

type Tab = "dashboard" | "comparar" | "form";

// ------- Main Component -------

export default function IgMetricsClient({ metrics }: Props) {
  const [tab, setTab] = useState<Tab>("dashboard");

  // Build ordered period list (newest first, matching metrics order)
  const periods = useMemo(
    () => metrics.map((m) => m.periodo || m.fecha_inicio || "\u2014").filter(Boolean),
    [metrics]
  );

  // Period selector state
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0] ?? "");

  // Comparar state
  const [compareA, setCompareA] = useState(periods[0] ?? "");
  const [compareB, setCompareB] = useState(periods[1] ?? periods[0] ?? "");

  // Find metric by period label
  function findMetric(label: string): IgMetrics | null {
    return metrics.find((m) => (m.periodo || m.fecha_inicio) === label) ?? null;
  }

  const current = findMetric(selectedPeriod);
  const currentIdx = metrics.findIndex((m) => (m.periodo || m.fecha_inicio) === selectedPeriod);
  const previous = currentIdx >= 0 && currentIdx < metrics.length - 1 ? metrics[currentIdx + 1] : null;

  const seguidoresNeto = current ? current.nuevos_seguidores - current.unfollows : 0;
  const er = current && current.total_seguidores > 0
    ? (current.total_interacciones / current.total_seguidores) * 100
    : 0;

  // Chart data (all metrics, chronological)
  const chartData = useMemo(
    () => [...metrics].reverse().map((m) => ({
      periodo: m.periodo || m.fecha_inicio || "\u2014",
      alcance: m.cuentas_alcanzadas,
      impresiones: m.impresiones,
      seguidores: m.total_seguidores,
      nuevos: m.nuevos_seguidores,
      unfollows: m.unfollows,
      interacciones_reels: m.interacciones_reels,
      interacciones_posts: Number(m.interacciones_posts ?? 0),
      interacciones_stories: Number(m.interacciones_stories ?? 0),
    })),
    [metrics]
  );

  // Compare tab metrics
  const metricA = findMetric(compareA);
  const metricB = findMetric(compareB);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">IG Metrics</h1>
          <p className="text-sm text-[var(--muted)]">
            {metrics.length} periodo{metrics.length !== 1 ? "s" : ""} cargado{metrics.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("dashboard")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "dashboard"
                ? "bg-[var(--purple)] text-white"
                : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab("comparar")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "comparar"
                ? "bg-[var(--purple)] text-white"
                : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            Comparar
          </button>
          <button
            onClick={() => setTab("form")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "form"
                ? "bg-[var(--purple)] text-white"
                : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            + Cargar
          </button>
        </div>
      </div>

      {/* ==================== FORM TAB ==================== */}
      {tab === "form" && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <AddMetricForm onSuccess={() => window.location.reload()} />
        </div>
      )}

      {/* ==================== DASHBOARD TAB ==================== */}
      {tab === "dashboard" && (
        <>
          {metrics.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center">
              <p className="text-[var(--muted)]">No hay metricas cargadas.</p>
              <button
                onClick={() => setTab("form")}
                className="mt-3 px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm font-medium hover:bg-[var(--purple-dark)] transition-colors"
              >
                Cargar primera metrica
              </button>
            </div>
          ) : (
            <>
              {/* Period Selector */}
              <div className="flex items-center gap-4">
                <PeriodSelector
                  periods={periods}
                  selected={selectedPeriod}
                  onChange={setSelectedPeriod}
                  label="Periodo:"
                />
                {previous && (
                  <span className="text-xs text-[var(--muted)]">
                    vs {previous.periodo || previous.fecha_inicio}
                  </span>
                )}
              </div>

              {/* KPI Cards */}
              {current && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard
                    label="Alcance"
                    value={current.cuentas_alcanzadas}
                    delta={Number(current.delta_alcance_pct) || (previous ? delta(current.cuentas_alcanzadas, previous.cuentas_alcanzadas) : null)}
                  />
                  <KPICard
                    label="Seguidores (neto)"
                    value={seguidoresNeto}
                    delta={Number(current.delta_seguidores_pct) || (previous ? delta(seguidoresNeto, previous.nuevos_seguidores - previous.unfollows) : null)}
                  />
                  <KPICard
                    label="Interacciones"
                    value={current.total_interacciones}
                    delta={Number(current.delta_interacciones_pct) || (previous ? delta(current.total_interacciones, previous.total_interacciones) : null)}
                  />
                  <KPICard
                    label="Engagement Rate"
                    value={er}
                    format="pct"
                  />
                </div>
              )}

              {/* Stored Deltas Row */}
              {current && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Alcance", delta: current.delta_alcance_pct },
                    { label: "Impresiones", delta: current.delta_impresiones_pct },
                    { label: "Visitas", delta: current.delta_visitas_pct },
                    { label: "Enlaces", delta: current.delta_enlaces_pct },
                    { label: "Seguidores", delta: current.delta_seguidores_pct },
                    { label: "Interacciones", delta: current.delta_interacciones_pct },
                    { label: "Reels", delta: current.delta_reels_pct },
                    { label: "Posts", delta: current.delta_posts_pct },
                    { label: "Stories", delta: current.delta_stories_pct },
                  ].filter((d) => d.delta != null && Number(d.delta) !== 0).length > 0 && (
                    <div className="col-span-full">
                      <h3 className="text-xs uppercase text-[var(--muted)] font-semibold mb-2">
                        Deltas vs periodo anterior (cargados)
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { label: "Alcance", delta: current.delta_alcance_pct },
                          { label: "Impresiones", delta: current.delta_impresiones_pct },
                          { label: "Visitas", delta: current.delta_visitas_pct },
                          { label: "Enlaces", delta: current.delta_enlaces_pct },
                          { label: "Seguidores", delta: current.delta_seguidores_pct },
                          { label: "Interacciones", delta: current.delta_interacciones_pct },
                          { label: "Reels", delta: current.delta_reels_pct },
                          { label: "Posts", delta: current.delta_posts_pct },
                          { label: "Stories", delta: current.delta_stories_pct },
                        ].map((d) => {
                          const v = Number(d.delta);
                          if (!v) return null;
                          return (
                            <div key={d.label} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 flex flex-col items-center">
                              <span className="text-xs text-[var(--muted)]">{d.label}</span>
                              {deltaTag(v)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Charts */}
              {chartData.length > 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Alcance e Impresiones</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="periodo" tick={{ fill: "#71717a", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} labelStyle={{ color: "#e5e5e5" }} />
                        <Legend />
                        <Line type="monotone" dataKey="alcance" stroke={CHART_COLORS.alcance} strokeWidth={2} name="Alcance" dot={false} />
                        <Line type="monotone" dataKey="impresiones" stroke={CHART_COLORS.impresiones} strokeWidth={2} name="Impresiones" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Seguidores</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="periodo" tick={{ fill: "#71717a", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} labelStyle={{ color: "#e5e5e5" }} />
                        <Legend />
                        <Line type="monotone" dataKey="seguidores" stroke={CHART_COLORS.seguidores} strokeWidth={2} name="Total" dot={false} />
                        <Line type="monotone" dataKey="nuevos" stroke={CHART_COLORS.nuevos} strokeWidth={1.5} name="Nuevos" dot={false} />
                        <Line type="monotone" dataKey="unfollows" stroke={CHART_COLORS.unfollows} strokeWidth={1.5} name="Unfollows" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Interacciones por Tipo</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="periodo" tick={{ fill: "#71717a", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} labelStyle={{ color: "#e5e5e5" }} />
                        <Legend />
                        <Bar dataKey="interacciones_reels" fill={CHART_COLORS.reels} name="Reels" />
                        <Bar dataKey="interacciones_posts" fill={CHART_COLORS.posts} name="Posts" />
                        <Bar dataKey="interacciones_stories" fill={CHART_COLORS.stories} name="Stories" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Funnel */}
                  {current && (
                    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Funnel IG</h3>
                      <FunnelRow label="Alcance" value={current.cuentas_alcanzadas} rate={null} />
                      <FunnelRow label="Visita Perfil" value={current.visitas_perfil} rate={pct(current.visitas_perfil, current.cuentas_alcanzadas)} />
                      <FunnelRow label="Toque Enlace" value={current.toques_enlaces} rate={pct(current.toques_enlaces, current.visitas_perfil)} />
                      <FunnelRow label="Lead" value={current.leads_ig} rate={pct(current.leads_ig, current.toques_enlaces)} />
                      <FunnelRow label="Venta" value={current.ventas_ig} rate={pct(current.ventas_ig, current.leads_ig)} />
                      <FunnelRow label="Cash" value={current.cash_ig} rate={formatUSD(current.cash_ig)} />
                    </div>
                  )}
                </div>
              )}

              {/* Single record: show funnel + rates without charts */}
              {chartData.length === 1 && current && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Funnel IG</h3>
                    <FunnelRow label="Alcance" value={current.cuentas_alcanzadas} rate={null} />
                    <FunnelRow label="Visita Perfil" value={current.visitas_perfil} rate={pct(current.visitas_perfil, current.cuentas_alcanzadas)} />
                    <FunnelRow label="Toque Enlace" value={current.toques_enlaces} rate={pct(current.toques_enlaces, current.visitas_perfil)} />
                    <FunnelRow label="Lead" value={current.leads_ig} rate={pct(current.leads_ig, current.toques_enlaces)} />
                    <FunnelRow label="Venta" value={current.ventas_ig} rate={pct(current.ventas_ig, current.leads_ig)} />
                    <FunnelRow label="Cash" value={current.cash_ig} rate={formatUSD(current.cash_ig)} />
                  </div>
                  <RatesTable current={current} previous={previous} />
                </div>
              )}

              {/* Rates + Comparison (multi record) */}
              {current && chartData.length > 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <RatesTable current={current} previous={previous} />
                  {previous && <ComparisonTable current={current} previous={previous} />}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ==================== COMPARAR TAB ==================== */}
      {tab === "comparar" && (
        <>
          {periods.length < 2 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center">
              <p className="text-[var(--muted)]">Necesitas al menos 2 periodos para comparar.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <PeriodSelector periods={periods} selected={compareA} onChange={setCompareA} label="Periodo A:" />
                <span className="text-[var(--muted)] text-sm">vs</span>
                <PeriodSelector periods={periods} selected={compareB} onChange={setCompareB} label="Periodo B:" />
              </div>

              {metricA && metricB && compareA !== compareB && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Side-by-side KPIs */}
                  <div className="col-span-full">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Alcance", keyA: metricA.cuentas_alcanzadas, keyB: metricB.cuentas_alcanzadas },
                        { label: "Seguidores Neto", keyA: metricA.nuevos_seguidores - metricA.unfollows, keyB: metricB.nuevos_seguidores - metricB.unfollows },
                        { label: "Interacciones", keyA: metricA.total_interacciones, keyB: metricB.total_interacciones },
                        { label: "Cash IG", keyA: metricA.cash_ig, keyB: metricB.cash_ig },
                      ].map((kpi) => {
                        const d = delta(kpi.keyA, kpi.keyB);
                        return (
                          <div key={kpi.label} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
                            <span className="text-xs text-[var(--muted)] uppercase">{kpi.label}</span>
                            <div className="flex items-baseline gap-3 mt-1">
                              <span className="text-lg font-bold text-white">{kpi.keyA.toLocaleString()}</span>
                              <span className="text-sm text-[var(--muted)]">vs {kpi.keyB.toLocaleString()}</span>
                            </div>
                            {d !== null && (
                              <p className={`text-xs mt-1 ${d >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                                {d >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(d).toFixed(1)}%
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Full comparison table */}
                  <div className="col-span-full">
                    <ComparisonTable current={metricA} previous={metricB} />
                  </div>
                </div>
              )}

              {compareA === compareB && (
                <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 text-center">
                  <p className="text-[var(--muted)]">Selecciona dos periodos diferentes para comparar.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
