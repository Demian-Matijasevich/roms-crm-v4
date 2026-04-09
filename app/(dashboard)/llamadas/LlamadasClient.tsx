"use client";

import { useState, useMemo, useCallback } from "react";
import type { TeamMember, AuthSession, LeadScore, Payment } from "@/lib/types";
import type { LeadWithTeam } from "@/lib/queries/leads";
import { LEAD_ESTADOS_LABELS, PROGRAMS } from "@/lib/constants";
import { formatUSD, formatDate } from "@/lib/format";
import { getFiscalMonthOptions, getFiscalEnd, parseLocalDate } from "@/lib/date-utils";
import StatusBadge from "@/app/components/StatusBadge";

interface Props {
  leads: LeadWithTeam[];
  closers: TeamMember[];
  setters: TeamMember[];
  payments: Payment[];
  session: AuthSession;
}

const SCORE_COLORS: Record<string, string> = {
  A: "bg-green-500/15 text-green-400 border-green-500/20",
  B: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  C: "bg-orange-400/15 text-orange-400 border-orange-400/20",
  D: "bg-red-500/15 text-red-400 border-red-500/20",
};

function LeadScoreBadge({ score }: { score: LeadScore | null }) {
  if (!score) return <span className="text-xs text-muted">--</span>;
  const color = SCORE_COLORS[score] || "bg-gray-500/15 text-gray-400 border-gray-500/20";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${color}`}>
      {score}
    </span>
  );
}

// Sort direction type
type SortDir = "asc" | "desc" | null;
type SortKey = "nombre" | "fecha" | "cash" | "ticket" | "saldo";

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <span className="ml-1 text-[10px] opacity-40">&#8597;</span>;
  return <span className="ml-1 text-[10px] text-[var(--purple-light)]">{dir === "asc" ? "\u2191" : "\u2193"}</span>;
}

export default function LlamadasClient({ leads, closers, setters, payments, session }: Props) {
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("todos");
  const [closerFilter, setCloserFilter] = useState<string>("todos");
  const [setterFilter, setSetterFilter] = useState<string>("todos");
  const [monthFilter, setMonthFilter] = useState<string>("todos");
  const [pagoFilter, setPagoFilter] = useState<string>("todos");
  const [programaFilter, setProgramaFilter] = useState<string>("todos");
  const [calificadoFilter, setCalificadoFilter] = useState<string>("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showEstadoCuenta, setShowEstadoCuenta] = useState<string | null>(null);
  const [showRefundForm, setShowRefundForm] = useState<string | null>(null);
  const [refundMonto, setRefundMonto] = useState("");
  const [refundMotivo, setRefundMotivo] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Inline edit state
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const handleSave = useCallback(async (leadId: string) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/llamadas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, ...editData }),
      });
      const json = await res.json();
      if (json.ok) {
        setSaveMsg("Guardado correctamente");
        setTimeout(() => window.location.reload(), 800);
      } else {
        setSaveMsg(`Error: ${json.error || "desconocido"}`);
      }
    } catch {
      setSaveMsg("Error de red");
    } finally {
      setSaving(false);
    }
  }, [editData]);

  const handleRefundSubmit = useCallback(async (leadId: string) => {
    const monto = parseFloat(refundMonto);
    if (!monto || monto <= 0) {
      setRefundMsg("Ingresa un monto valido");
      return;
    }
    setRefundLoading(true);
    setRefundMsg(null);
    try {
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          numero_cuota: 1,
          monto_usd: monto,
          monto_ars: 0,
          fecha_pago: new Date().toISOString().split("T")[0],
          estado: "refund",
          metodo_pago: "transferencia",
          receptor: refundMotivo || "Refund",
          es_renovacion: false,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setRefundMsg("Refund registrado correctamente");
        setRefundMonto("");
        setRefundMotivo("");
        setTimeout(() => window.location.reload(), 800);
      } else {
        setRefundMsg(`Error: ${json.error || "desconocido"}`);
      }
    } catch {
      setRefundMsg("Error de red");
    } finally {
      setRefundLoading(false);
    }
  }, [refundMonto, refundMotivo]);

  const monthOptions = useMemo(() => getFiscalMonthOptions(12), []);

  // Group payments by lead_id for O(1) lookups
  const paymentsByLead = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const p of payments) {
      if (!p.lead_id) continue;
      const arr = map.get(p.lead_id);
      if (arr) arr.push(p);
      else map.set(p.lead_id, [p]);
    }
    return map;
  }, [payments]);

  // Helper: get audit data for a lead
  const getAuditData = useCallback(
    (leadId: string, ticketTotal: number) => {
      const leadPayments = paymentsByLead.get(leadId) || [];
      const pagados = leadPayments.filter((p) => p.estado === "pagado");
      const cashCollected = pagados.reduce((sum, p) => sum + p.monto_usd, 0);
      const cuotasPagadas = pagados.filter((p) => p.numero_cuota > 1).length;
      const saldoPendiente = ticketTotal - cashCollected;
      const receptor = leadPayments.length > 0 ? leadPayments[0].receptor : null;
      return { cashCollected, cuotasPagadas, saldoPendiente, receptor };
    },
    [paymentsByLead]
  );

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch =
          lead.nombre?.toLowerCase().includes(q) ||
          lead.instagram?.toLowerCase().includes(q) ||
          lead.email?.toLowerCase().includes(q) ||
          lead.telefono?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Estado filter
      if (estadoFilter !== "todos" && lead.estado !== estadoFilter) return false;

      // Closer filter
      if (closerFilter !== "todos" && lead.closer_id !== closerFilter) return false;

      // Setter filter
      if (setterFilter !== "todos" && lead.setter_id !== setterFilter) return false;

      // Programa filter
      if (programaFilter !== "todos" && lead.programa_pitcheado !== programaFilter) return false;

      // Calificado filter
      if (calificadoFilter !== "todos") {
        if (calificadoFilter === "si" && lead.lead_calificado !== "calificado") return false;
        if (calificadoFilter === "no" && lead.lead_calificado === "calificado") return false;
      }

      // Month filter
      if (monthFilter !== "todos" && lead.fecha_llamada) {
        const llamadaDate = parseLocalDate(lead.fecha_llamada.split("T")[0]);
        const monthStart = parseLocalDate(monthFilter);
        const monthEnd = getFiscalEnd(monthStart);
        if (llamadaDate < monthStart || llamadaDate > monthEnd) return false;
      }

      // Payment filter
      if (pagoFilter !== "todos") {
        const leadPayments = paymentsByLead.get(lead.id) || [];
        const hasPago = leadPayments.some(p => p.estado === "pagado" && p.monto_usd > 0);
        if (pagoFilter === "solo_ventas" && lead.estado !== "cerrado" && lead.estado !== "adentro_seguimiento") return false;
        if (pagoFilter === "con_pago" && !hasPago) return false;
        if (pagoFilter === "sin_pago" && hasPago) return false;
      }

      return true;
    });
  }, [leads, search, estadoFilter, closerFilter, setterFilter, monthFilter, programaFilter, calificadoFilter, pagoFilter, paymentsByLead]);

  // Sorted data
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const auditA = getAuditData(a.id, a.ticket_total);
      const auditB = getAuditData(b.id, b.ticket_total);
      switch (sortKey) {
        case "nombre":
          return dir * (a.nombre || "").localeCompare(b.nombre || "");
        case "fecha":
          return dir * (a.fecha_llamada || "").localeCompare(b.fecha_llamada || "");
        case "cash":
          return dir * (auditA.cashCollected - auditB.cashCollected);
        case "ticket":
          return dir * (a.ticket_total - b.ticket_total);
        case "saldo":
          return dir * (auditA.saldoPendiente - auditB.saldoPendiente);
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir, getAuditData]);

  // Summary totals
  const totals = useMemo(() => {
    let totalTicket = 0;
    let totalCash = 0;
    let totalSaldo = 0;
    for (const lead of filtered) {
      const audit = getAuditData(lead.id, lead.ticket_total);
      totalTicket += lead.ticket_total;
      totalCash += audit.cashCollected;
      totalSaldo += audit.saldoPendiente;
    }
    return { totalTicket, totalCash, totalSaldo };
  }, [filtered, getAuditData]);

  // CSV export
  const handleExportCSV = useCallback(() => {
    const headers = [
      "Nombre", "Instagram", "Fecha", "Estado", "Closer", "Setter",
      "Ticket Total", "Score", "Cash Collected", "Cuotas Pagadas",
      "Saldo Pendiente", "Receptor",
    ];

    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const rows = filtered.map((lead) => {
      const audit = getAuditData(lead.id, lead.ticket_total);
      return [
        lead.nombre || "",
        lead.instagram ? `@${lead.instagram.replace(/^@/, "")}` : "",
        lead.fecha_llamada || "",
        LEAD_ESTADOS_LABELS[lead.estado] || lead.estado,
        lead.closer?.nombre || "",
        lead.setter?.nombre || "",
        lead.ticket_total.toString(),
        lead.lead_score || "",
        audit.cashCollected.toString(),
        audit.cuotasPagadas.toString(),
        audit.saldoPendiente.toString(),
        audit.receptor || "",
      ].map(escapeCSV);
    });

    rows.push([
      "TOTALES", "", "", "", "", "",
      totals.totalTicket.toString(), "",
      totals.totalCash.toString(), "",
      totals.totalSaldo.toString(), "", "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `llamadas_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, getAuditData, totals]);

  const estadoOptions = Object.entries(LEAD_ESTADOS_LABELS);

  const inputClass =
    "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]";
  const selectClass = inputClass;

  // Suppress unused variable warning
  void session;

  const thSortClass = "px-4 py-3 text-[var(--muted)] font-medium cursor-pointer select-none hover:text-[var(--foreground)] transition-colors";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Llamadas</h1>
          <p className="text-sm text-[var(--muted)]">
            {filtered.length} de {leads.length} leads
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg transition-colors"
        >
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre, IG, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} w-64`}
        />

        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los estados</option>
          {estadoOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select
          value={closerFilter}
          onChange={(e) => setCloserFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los closers</option>
          {closers.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        <select
          value={setterFilter}
          onChange={(e) => setSetterFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los setters</option>
          {setters.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>

        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los meses</option>
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        <select
          value={programaFilter}
          onChange={(e) => setProgramaFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los programas</option>
          {Object.entries(PROGRAMS).map(([key, p]) => (
            <option key={key} value={key}>{p.label}</option>
          ))}
        </select>

        <select
          value={calificadoFilter}
          onChange={(e) => setCalificadoFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Calificado: Todos</option>
          <option value="si">Calificado: Si</option>
          <option value="no">Calificado: No</option>
        </select>

        <select
          value={pagoFilter}
          onChange={(e) => setPagoFilter(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos los pagos</option>
          <option value="solo_ventas">Solo ventas (cerradas)</option>
          <option value="con_pago">Con pago registrado</option>
          <option value="sin_pago">Sin pago</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-left">
                <th className={thSortClass} onClick={() => toggleSort("nombre")}>
                  Nombre<SortIndicator active={sortKey === "nombre"} dir={sortKey === "nombre" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Instagram</th>
                <th className={thSortClass} onClick={() => toggleSort("fecha")}>
                  Fecha<SortIndicator active={sortKey === "fecha"} dir={sortKey === "fecha" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Estado</th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Closer</th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Setter</th>
                <th className={`${thSortClass} text-right`} onClick={() => toggleSort("ticket")}>
                  Ticket<SortIndicator active={sortKey === "ticket"} dir={sortKey === "ticket" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium text-center">Score</th>
                <th className={`${thSortClass} text-right`} onClick={() => toggleSort("cash")}>
                  Cash<SortIndicator active={sortKey === "cash"} dir={sortKey === "cash" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium text-center">Cuotas</th>
                <th className={`${thSortClass} text-right`} onClick={() => toggleSort("saldo")}>
                  Saldo<SortIndicator active={sortKey === "saldo"} dir={sortKey === "saldo" ? sortDir : null} />
                </th>
                <th className="px-4 py-3 text-[var(--muted)] font-medium">Receptor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-[var(--muted)]">
                    No se encontraron leads con esos filtros.
                  </td>
                </tr>
              )}
              {sorted.map((lead) => {
                const audit = getAuditData(lead.id, lead.ticket_total);
                const isExpanded = expandedId === lead.id;
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    className={`border-b border-[var(--card-border)] hover:bg-[var(--purple)]/5 cursor-pointer transition-colors ${isExpanded ? "bg-[var(--purple)]/5" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      {lead.nombre || "Sin nombre"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {lead.instagram ? `@${lead.instagram.replace(/^@/, "")}` : "---"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatDate(lead.fecha_llamada)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={lead.estado}
                        label={LEAD_ESTADOS_LABELS[lead.estado] || lead.estado}
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {lead.closer?.nombre || "---"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {lead.setter?.nombre || "---"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {lead.ticket_total > 0 ? formatUSD(lead.ticket_total) : "---"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LeadScoreBadge score={lead.lead_score} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {audit.cashCollected > 0 ? (
                        <span className="text-green-400">{formatUSD(audit.cashCollected)}</span>
                      ) : (
                        "---"
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {audit.cuotasPagadas > 0 ? audit.cuotasPagadas : "---"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {audit.saldoPendiente > 0 ? (
                        <span className="text-red-400">{formatUSD(audit.saldoPendiente)}</span>
                      ) : audit.saldoPendiente < 0 ? (
                        <span className="text-yellow-400">{formatUSD(audit.saldoPendiente)}</span>
                      ) : (
                        "---"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] text-xs">
                      {audit.receptor || "---"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Footer totals row */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--purple)]/30 bg-[var(--purple)]/5 font-semibold">
                  <td className="px-4 py-3" colSpan={6}>
                    TOTALES ({filtered.length} leads)
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">
                    {formatUSD(totals.totalTicket)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-mono text-green-400">
                    {formatUSD(totals.totalCash)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-mono text-red-400">
                    {formatUSD(totals.totalSaldo)}
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Expanded Lead Detail — Grid layout */}
      {expandedId && (() => {
        const lead = sorted.find((l) => l.id === expandedId);
        if (!lead) return null;
        const leadPayments = paymentsByLead.get(lead.id) || [];
        const audit = getAuditData(lead.id, lead.ticket_total);

        // Initialize edit data when expanding a different lead
        if (editData._leadId !== lead.id) {
          setTimeout(() => {
            setEditData({
              _leadId: lead.id,
              estado: lead.estado,
              programa_pitcheado: lead.programa_pitcheado || "",
              lead_calificado: lead.lead_calificado || "",
              ticket_total: lead.ticket_total,
              notas_internas: lead.notas_internas || "",
              reporte_general: lead.reporte_general || "",
            });
            setSaveMsg(null);
          }, 0);
        }
        return (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{lead.nombre}</h3>
              <button
                onClick={() => setExpandedId(null)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg"
              >
                &times;
              </button>
            </div>

            {/* ── Section Grid: 3 columns ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* Contacto */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Contacto</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Email</span>
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="text-blue-400 hover:underline truncate ml-2">{lead.email}</a>
                    ) : <span className="text-[var(--muted)]">---</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Telefono</span>
                    {lead.telefono ? (
                      <a href={`tel:${lead.telefono}`} className="text-blue-400 hover:underline">{lead.telefono}</a>
                    ) : <span className="text-[var(--muted)]">---</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Instagram</span>
                    {lead.instagram ? (
                      <a href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        @{lead.instagram.replace(/^@/, "")}
                      </a>
                    ) : <span className="text-[var(--muted)]">---</span>}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Fuente</span>
                    <span>{lead.fuente || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Detalles */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Detalles</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Fecha Agenda</span>
                    <span>{formatDate(lead.fecha_agendado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Se Presento</span>
                    <span>{lead.estado === "no_show" ? "No" : lead.fecha_llamada ? "Si" : "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Calificado</span>
                    <span>{lead.lead_calificado ? lead.lead_calificado.replace(/_/g, " ") : "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Cash Total</span>
                    <span className="font-mono text-green-400">{formatUSD(audit.cashCollected)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Decisor</span>
                    <span>{lead.decisor || "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Exp. Ecommerce</span>
                    <span>{lead.experiencia_ecommerce || "---"}</span>
                  </div>
                </div>
              </div>

              {/* Pagos */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider">Pagos</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Plan</span>
                    <span>{lead.plan_pago?.replace(/_/g, " ") || "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Metodo</span>
                    <span>{leadPayments[0]?.metodo_pago?.replace(/_/g, " ") || "---"}</span>
                  </div>
                  {leadPayments.length > 0 ? (
                    leadPayments
                      .sort((a, b) => a.numero_cuota - b.numero_cuota)
                      .map((p) => (
                        <div key={p.id} className="flex justify-between items-center">
                          <span className="text-[var(--muted)]">Cuota #{p.numero_cuota}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatUSD(p.monto_usd)}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              p.estado === "pagado" ? "bg-green-500/15 text-green-400 border-green-500/20" :
                              p.estado === "pendiente" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" :
                              p.estado === "perdido" ? "bg-red-500/15 text-red-400 border-red-500/20" :
                              "bg-orange-400/15 text-orange-400 border-orange-400/20"
                            }`}>
                              {p.estado}
                            </span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-[var(--muted)] text-xs">Sin pagos registrados</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contextos */}
            {(lead.contexto_setter || lead.reporte_general) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--card-border)]">
                {lead.contexto_setter && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider mb-1">Contexto Setter</h4>
                    <p className="text-sm leading-relaxed bg-white/5 rounded-lg p-3">{lead.contexto_setter}</p>
                  </div>
                )}
                {lead.reporte_general && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-[var(--purple-light)] tracking-wider mb-1">Contexto Closer</h4>
                    <p className="text-sm leading-relaxed bg-white/5 rounded-lg p-3">{lead.reporte_general}</p>
                  </div>
                )}
              </div>
            )}

            {/* Inline Edit Form */}
            <div className="pt-3 border-t border-[var(--card-border)] space-y-4">
              <h4 className="text-sm font-semibold text-[var(--purple-light)]">Editar lead</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Estado</label>
                  <select
                    value={(editData.estado as string) || lead.estado}
                    onChange={(e) => setEditData({ ...editData, estado: e.target.value })}
                    className={selectClass}
                  >
                    {estadoOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Programa pitcheado</label>
                  <select
                    value={(editData.programa_pitcheado as string) || ""}
                    onChange={(e) => setEditData({ ...editData, programa_pitcheado: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">Sin programa</option>
                    {Object.entries(PROGRAMS).map(([key, p]) => (
                      <option key={key} value={key}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Lead calificado</label>
                  <select
                    value={(editData.lead_calificado as string) || ""}
                    onChange={(e) => setEditData({ ...editData, lead_calificado: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">---</option>
                    <option value="calificado">Calificado</option>
                    <option value="no_calificado">No calificado</option>
                    <option value="podria">Podria</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Ticket total (USD)</label>
                  <input
                    type="number"
                    value={(editData.ticket_total as number) ?? lead.ticket_total}
                    onChange={(e) => setEditData({ ...editData, ticket_total: Number(e.target.value) })}
                    className={inputClass}
                    min={0}
                    step={100}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Notas internas</label>
                  <textarea
                    value={(editData.notas_internas as string) || ""}
                    onChange={(e) => setEditData({ ...editData, notas_internas: e.target.value })}
                    className={`${inputClass} w-full min-h-[80px] resize-y`}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] mb-1 block">Reporte general</label>
                  <textarea
                    value={(editData.reporte_general as string) || ""}
                    onChange={(e) => setEditData({ ...editData, reporte_general: e.target.value })}
                    className={`${inputClass} w-full min-h-[80px] resize-y`}
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSave(lead.id)}
                  disabled={saving}
                  className="text-sm font-medium bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                {saveMsg && (
                  <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => setShowEstadoCuenta(showEstadoCuenta === lead.id ? null : lead.id)}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                  showEstadoCuenta === lead.id
                    ? "bg-[var(--purple)] text-white"
                    : "bg-[var(--purple)]/15 border border-[var(--purple)]/30 text-[var(--purple-light)] hover:bg-[var(--purple)]/25"
                }`}
              >
                {showEstadoCuenta === lead.id ? "Cerrar Estado de Cuenta" : "Estado de Cuenta"}
              </button>
              <button
                onClick={() => {
                  setShowRefundForm(showRefundForm === lead.id ? null : lead.id);
                  setRefundMonto("");
                  setRefundMotivo("");
                  setRefundMsg(null);
                }}
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                  showRefundForm === lead.id
                    ? "bg-red-500 text-white"
                    : "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                }`}
              >
                {showRefundForm === lead.id ? "Cerrar Refund" : "Refund"}
              </button>
              <a
                href="/form/llamada"
                className="text-sm font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] px-4 py-2 rounded-lg transition-colors"
              >
                Cargar resultado
              </a>
              <a
                href="/pipeline"
                className="text-sm font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)] px-4 py-2 rounded-lg transition-colors"
              >
                Ver en pipeline
              </a>
            </div>

            {/* Inline Refund Form */}
            {showRefundForm === lead.id && (
              <div className="mt-4 pt-4 border-t border-[var(--card-border)] space-y-4">
                <h4 className="text-sm font-semibold text-red-400">Cargar Refund</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-[var(--muted)] mb-1 block">Monto a devolver (USD) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-sm">$</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={refundMonto}
                        onChange={(e) => setRefundMonto(e.target.value)}
                        placeholder="0"
                        className={`${inputClass} pl-7`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted)] mb-1 block">Motivo del refund</label>
                    <textarea
                      value={refundMotivo}
                      onChange={(e) => setRefundMotivo(e.target.value)}
                      rows={2}
                      placeholder="Razon del refund..."
                      className={`${inputClass} w-full resize-none`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleRefundSubmit(lead.id)}
                    disabled={refundLoading}
                    className="text-sm font-medium bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {refundLoading ? "Procesando..." : "Confirmar Refund"}
                  </button>
                  {refundMsg && (
                    <span className={`text-sm ${refundMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                      {refundMsg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Inline Estado de Cuenta */}
            {showEstadoCuenta === lead.id && (() => {
              const pagados = leadPayments.filter((p) => p.estado === "pagado");
              const pendientes = leadPayments.filter((p) => p.estado === "pendiente");
              const perdidos = leadPayments.filter((p) => p.estado === "perdido");
              const refunds = leadPayments.filter((p) => p.estado === "refund");
              const totalRefund = refunds.reduce((sum, p) => sum + p.monto_usd, 0);
              const totalPagado = pagados.reduce((sum, p) => sum + p.monto_usd, 0);
              const totalPendiente = pendientes.reduce((sum, p) => sum + p.monto_usd, 0);
              const totalPerdido = perdidos.reduce((sum, p) => sum + p.monto_usd, 0);
              const saldo = lead.ticket_total - totalPagado;

              return (
                <div id={`estado-cuenta-${lead.id}`} className="mt-4 pt-4 border-t border-[var(--card-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--purple-light)]">Estado de Cuenta</h4>
                    <button
                      onClick={() => {
                        const el = document.getElementById(`estado-cuenta-${lead.id}`);
                        if (!el) return;
                        const printWindow = window.open("", "_blank");
                        if (!printWindow) return;
                        printWindow.document.write(`
                          <html><head><title>Estado de Cuenta - ${lead.nombre}</title>
                          <style>
                            body { font-family: system-ui, sans-serif; padding: 2rem; color: #000; }
                            table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
                            th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 13px; }
                            th { background: #f3f4f6; font-weight: 600; }
                            .green { color: #15803d; } .yellow { color: #a16207; } .red { color: #b91c1c; }
                            .summary { border-top: 2px solid #000; padding-top: 1rem; margin-top: 1rem; }
                            .summary div { display: flex; justify-content: space-between; padding: 4px 0; }
                          </style></head><body>
                          <h1>Estado de Cuenta — ${lead.nombre}</h1>
                          <p>Ticket total: $${lead.ticket_total.toLocaleString()}</p>
                          ${el.querySelector("table")?.outerHTML || ""}
                          <div class="summary">
                            <div><span>Total Pagado</span><span class="green">$${totalPagado.toLocaleString()}</span></div>
                            <div><span>Cuotas Pendientes</span><span class="yellow">$${totalPendiente.toLocaleString()}</span></div>
                            ${totalPerdido > 0 ? `<div><span>Perdido / Refund</span><span class="red">$${totalPerdido.toLocaleString()}</span></div>` : ""}
                            <div style="border-top:1px solid #ddd;padding-top:8px;margin-top:8px"><span><b>Saldo Pendiente</b></span><span class="${saldo > 0 ? "red" : "green"}"><b>$${saldo.toLocaleString()}</b></span></div>
                          </div>
                          </body></html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }}
                      className="text-xs font-medium border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] px-3 py-1 rounded-lg transition-colors"
                    >
                      Imprimir
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--card-border)] text-left">
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">#</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Monto USD</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Estado</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Fecha Pago</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Vencimiento</th>
                          <th className="px-3 py-2 text-[var(--muted)] font-medium">Receptor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadPayments.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-4 text-[var(--muted)]">
                              Sin pagos registrados
                            </td>
                          </tr>
                        ) : (
                          leadPayments
                            .sort((a, b) => a.numero_cuota - b.numero_cuota)
                            .map((p) => (
                              <tr key={p.id} className="border-b border-[var(--card-border)]/50">
                                <td className="px-3 py-2">#{p.numero_cuota}</td>
                                <td className="px-3 py-2 font-mono font-medium">{formatUSD(p.monto_usd)}</td>
                                <td className={`px-3 py-2 font-medium ${
                                  p.estado === "pagado" ? "text-green-400" :
                                  p.estado === "pendiente" ? "text-yellow-400" :
                                  p.estado === "perdido" ? "text-red-400" :
                                  p.estado === "refund" ? "text-orange-400" : ""
                                }`}>
                                  {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                                </td>
                                <td className="px-3 py-2 text-[var(--muted)]">{formatDate(p.fecha_pago)}</td>
                                <td className="px-3 py-2 text-[var(--muted)]">{formatDate(p.fecha_vencimiento)}</td>
                                <td className="px-3 py-2 text-[var(--muted)]">{p.receptor ?? "---"}</td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 text-sm pt-2 border-t border-[var(--card-border)]">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Total Pagado</span>
                      <span className="font-bold text-green-400">{formatUSD(totalPagado)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Cuotas Pendientes</span>
                      <span className="font-bold text-yellow-400">{formatUSD(totalPendiente)}</span>
                    </div>
                    {totalPerdido > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Perdido</span>
                        <span className="font-bold text-red-400">{formatUSD(totalPerdido)}</span>
                      </div>
                    )}
                    {totalRefund > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Refunds</span>
                        <span className="font-bold text-orange-400">-{formatUSD(totalRefund)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[var(--card-border)] pt-2 mt-2">
                      <span className="font-semibold">Saldo Pendiente (Ticket - Pagado)</span>
                      <span className={`font-bold ${saldo > 0 ? "text-red-400" : "text-green-400"}`}>
                        {formatUSD(saldo)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}
