"use client";

import { useMemo, useState } from "react";
import MonthSelector77 from "@/app/components/MonthSelector77";
import LeadEditModal, { type EditableLead } from "@/app/components/LeadEditModal";
import AddPaymentModal, { type PaymentResult } from "@/app/components/AddPaymentModal";
import AddLeadModal from "@/app/components/AddLeadModal";
import PaymentEditModalShared, { type EditablePayment } from "@/app/components/PaymentEditModalShared";
import { formatUSD } from "@/lib/format";
import { computeValenCommission, SETTER_PCT } from "@/lib/commissions";
import { computeComisionesDetail, formatComisionesWA } from "@/lib/comisiones-detail";
import { getFiscalStart, getFiscalMonth, parseLocalDate } from "@/lib/date-utils";
import { useToast } from "@/app/components/Toast";
import type { PaymentRow, LeadLite, TeamLite, CampaignLite } from "./page";

interface Props {
  payments: PaymentRow[];
  leads: LeadLite[];
  team: TeamLite[];
  campaigns: CampaignLite[];
  fiscalStart: string;
  fiscalEnd: string;
  currentTeamMemberId?: string | null;
  isAdmin?: boolean;
}

interface SaleRow {
  paymentId: string;
  leadName: string;
  leadId: string;
  fecha: string;
  monto: number;
  cuota: number;
  receptor: string | null;
  programa: string | null;
  pctAplicado: number;
  comision: number;
}

export default function ComisionesClient({ payments: initialPayments, leads: initialLeads, team, campaigns, fiscalStart: defaultStart, fiscalEnd: defaultEnd, currentTeamMemberId, isAdmin }: Props) {
  const [leads, setLeads] = useState<LeadLite[]>(initialLeads);
  const [payments, setPayments] = useState<PaymentRow[]>(initialPayments);
  const [selectedMonth, setSelectedMonth] = useState(getFiscalStart().toISOString().split("T")[0]);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const editingPayment = useMemo<EditablePayment | null>(() => {
    if (!editingPaymentId) return null;
    const p = payments.find((x) => x.id === editingPaymentId);
    return p ? (p as unknown as EditablePayment) : null;
  }, [editingPaymentId, payments]);
  const closers = useMemo(() => team.filter((t) => t.is_closer), [team]);
  const setters = useMemo(() => team.filter((t) => t.is_setter), [team]);
  const editingLead = useMemo<EditableLead | null>(() => {
    if (!editingLeadId) return null;
    const l = leads.find((x) => x.id === editingLeadId);
    return l ? (l as unknown as EditableLead) : null;
  }, [editingLeadId, leads]);

  async function patchPayment(paymentId: string, field: string, value: string | number | null) {
    try {
      const res = await fetch("/api/pagos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setPayments((prev) => prev.map((p) => p.id === paymentId ? { ...p, [field]: value } as PaymentRow : p));
      } else {
        alert("Error: " + (json.error || "no se pudo guardar"));
      }
    } catch (err) {
      alert("Error de red: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleDeletePayment(paymentId: string, leadName: string) {
    const ok = window.confirm(`¿Eliminar este pago de "${leadName}"?\n\nAcción IRREVERSIBLE.`);
    if (!ok) return;
    setDeletingPayment(paymentId);
    try {
      const res = await fetch(`/api/pagos?id=${encodeURIComponent(paymentId)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      } else {
        alert("Error: " + (json.error || "no se pudo eliminar"));
      }
    } catch (err) {
      alert("Error de red: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingPayment(null);
    }
  }

  const toast = useToast();
  const monthRange = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: toStr(start), end: toStr(end) };
  }, [selectedMonth]);

  const currentLabel = useMemo(() => getFiscalMonth(parseLocalDate(selectedMonth)), [selectedMonth]);

  // YYYY-MM del mes seleccionado (para excluir refunds ya aplicados)
  const targetYM = selectedMonth.slice(0, 7);
  const [skipRefundIds, setSkipRefundIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  // Cálculo detallado de comisiones para el mensaje WA
  const detalleComisiones = useMemo(() => {
    return computeComisionesDetail({
      targetYM,
      leads: leads.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        closer_id: l.closer_id,
        setter_id: l.setter_id,
        utm_medium: l.utm_medium,
        programa_pitcheado: l.programa_pitcheado,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        lead_id: p.lead_id,
        numero_cuota: p.numero_cuota,
        monto_usd: p.monto_usd,
        fecha_pago: p.fecha_pago,
        estado: p.estado,
        es_renovacion: p.es_renovacion || false,
        descuento_comision_closer_usd: p.descuento_comision_closer_usd ?? null,
        descuento_comision_setter_usd: p.descuento_comision_setter_usd ?? null,
        aplicado_en_comisiones_mes: p.aplicado_en_comisiones_mes ?? null,
      })),
      team,
      campaigns,
      skipRefundIds,
      skipRefundsAplicados: true,
    });
  }, [targetYM, leads, payments, team, campaigns, skipRefundIds]);

  const mensajeWA = useMemo(() => formatComisionesWA(detalleComisiones), [detalleComisiones]);

  async function copyMensajeWA() {
    try {
      await navigator.clipboard.writeText(mensajeWA);
      toast.success("Mensaje copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function marcarRefundsAplicados() {
    if (detalleComisiones.refunds.length === 0) {
      toast.info("No hay refunds en este mes para marcar");
      return;
    }
    const refundIds = detalleComisiones.refunds.map((r) => r.payment_id);
    setMarking(true);
    try {
      const res = await fetch("/api/comisiones/aplicar-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_ids: refundIds, mes: targetYM }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.updated || 0} refunds marcados como aplicados en ${targetYM}. No se descontarán en próximos meses.`);
        // Refresh local state
        setPayments((prev) => prev.map((p) =>
          refundIds.includes(p.id) ? { ...p, aplicado_en_comisiones_mes: targetYM } : p
        ));
      } else {
        toast.error("No se pudo marcar");
      }
    } finally {
      setMarking(false);
    }
  }

  function excluirRefund(id: string) {
    setSkipRefundIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const leadById = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);
  const mediumToSetter = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaigns) if (c.setter_id && c.medium) m.set(c.medium.toLowerCase(), c.setter_id);
    return m;
  }, [campaigns]);

  // Filtrar pagos del mes seleccionado — solo "pagado" (refunds inflan tier multiplier).
  const monthPayments = useMemo(() => {
    return payments.filter(p => {
      if (!p.fecha_pago || !p.lead_id) return false;
      if (p.estado !== "pagado") return false;
      const f = p.fecha_pago.split("T")[0];
      return f >= monthRange.start && f <= monthRange.end;
    });
  }, [payments, monthRange]);

  // Por cada team_member, generar la lista de ventas (closer + setter por separado)
  const breakdownPorMiembro = useMemo(() => {
    const out: Array<{
      member: TeamLite;
      cashClosed: number;
      cashAsSetter: number;
      tierPct: { omni: number; multi: number; consultoria: number };
      multiplier: number;
      ventasComoCloser: SaleRow[];
      ventasComoSetter: SaleRow[];
      totalCloser: number;
      totalSetter: number;
      totalGeneral: number;
    }> = [];

    for (const m of team) {
      // Pagos donde el lead.closer_id = m.id
      const ventasCloser: SaleRow[] = [];
      const closerPaymentsForCalc: { monto_usd: number; programa: string | null }[] = [];
      let cashClosed = 0;
      for (const p of monthPayments) {
        const l = leadById.get(p.lead_id!);
        if (!l || l.closer_id !== m.id) continue;
        cashClosed += p.monto_usd;
        closerPaymentsForCalc.push({ monto_usd: p.monto_usd, programa: l.programa_pitcheado });
      }
      if (cashClosed > 0) {
        const result = computeValenCommission(closerPaymentsForCalc, cashClosed);
        for (const p of monthPayments) {
          const l = leadById.get(p.lead_id!);
          if (!l || l.closer_id !== m.id) continue;
          const prog = (l.programa_pitcheado || "").toLowerCase();
          const pct = prog.includes("multi") ? result.pctEff.multi
            : prog.includes("consult") ? result.pctEff.consultoria
            : result.pctEff.omni;
          ventasCloser.push({
            paymentId: p.id,
            leadName: l.nombre,
            leadId: l.id,
            fecha: p.fecha_pago!.split("T")[0],
            monto: p.monto_usd,
            cuota: p.numero_cuota,
            receptor: p.receptor,
            programa: l.programa_pitcheado,
            pctAplicado: pct,
            comision: p.monto_usd * (pct / 100),
          });
        }
      }
      const totalCloser = ventasCloser.reduce((s, v) => s + v.comision, 0);

      // Setter (3%): pagos donde el lead.setter_id = m.id O via utm_medium
      const ventasSetter: SaleRow[] = [];
      let cashAsSetter = 0;
      for (const p of monthPayments) {
        const l = leadById.get(p.lead_id!);
        if (!l) continue;
        let isSetter = l.setter_id === m.id;
        if (!isSetter && l.utm_medium) {
          isSetter = mediumToSetter.get(l.utm_medium.toLowerCase()) === m.id;
        }
        if (!isSetter) continue;
        cashAsSetter += p.monto_usd;
        ventasSetter.push({
          paymentId: p.id,
          leadName: l.nombre,
          leadId: l.id,
          fecha: p.fecha_pago!.split("T")[0],
          monto: p.monto_usd,
          cuota: p.numero_cuota,
          receptor: p.receptor,
          programa: l.programa_pitcheado,
          pctAplicado: SETTER_PCT * 100,
          comision: p.monto_usd * SETTER_PCT,
        });
      }
      const totalSetter = ventasSetter.reduce((s, v) => s + v.comision, 0);

      const total = totalCloser + totalSetter;
      if (total === 0 && cashClosed === 0 && cashAsSetter === 0) continue;

      // Tier multiplier para mostrar
      const mul = cashClosed <= 70000 ? 1.0 : cashClosed <= 100000 ? 1.15 : 1.3;
      const pctsEff = {
        omni: Math.min(7 * mul, 10),
        multi: Math.min(5 * mul, 10),
        consultoria: Math.min(7 * mul, 10),
      };

      out.push({
        member: m,
        cashClosed,
        cashAsSetter,
        tierPct: pctsEff,
        multiplier: mul,
        ventasComoCloser: ventasCloser.sort((a, b) => b.fecha.localeCompare(a.fecha)),
        ventasComoSetter: ventasSetter.sort((a, b) => b.fecha.localeCompare(a.fecha)),
        totalCloser,
        totalSetter,
        totalGeneral: total,
      });
    }
    const sorted = out.sort((a, b) => b.totalGeneral - a.totalGeneral);
    // Si no es admin, mostrar solo el row del usuario actual
    if (!isAdmin && currentTeamMemberId) {
      return sorted.filter((b) => b.member.id === currentTeamMemberId);
    }
    return sorted;
  }, [team, monthPayments, leadById, mediumToSetter, isAdmin, currentTeamMemberId]);

  void defaultStart; void defaultEnd;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Detalle de Comisiones</h1>
          <p className="text-sm text-[var(--muted)]">{currentLabel} — desglose lead-por-lead con % aplicado</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddLead(true)}
            className="text-sm bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg font-medium">
            + Nuevo lead
          </button>
          <button onClick={() => setShowAddPayment(true)}
            className="text-sm bg-[var(--green)] hover:bg-[var(--green)]/80 text-white px-4 py-2 rounded-lg font-medium">
            + Cargar pago
          </button>
          <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
        </div>
      </div>

      {/* 📋 Mensaje WhatsApp listo para copiar */}
      {isAdmin && (
        <div className="bg-[var(--card-bg)] border-2 border-[var(--purple)]/40 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">📋 Mensaje WhatsApp — listo para mandar</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Formato detallado con desglose por programa, refunds y descuentos. Excluye refunds ya marcados como aplicados.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyMensajeWA}
                className="text-sm bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg font-medium"
              >
                📋 Copiar mensaje
              </button>
              {detalleComisiones.refunds.length > 0 && (
                <button
                  onClick={marcarRefundsAplicados}
                  disabled={marking}
                  className="text-sm bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-4 py-2 rounded-lg disabled:opacity-50"
                  title="Marca los refunds de este mes como ya aplicados para que NO se descuenten otra vez en cierres futuros"
                >
                  {marking ? "..." : "✓ Marcar refunds aplicados"}
                </button>
              )}
            </div>
          </div>

          {/* Lista de refunds con toggle excluir */}
          {detalleComisiones.refunds.length > 0 && (
            <div className="mb-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-300 font-semibold mb-2">🔄 Refunds del mes ({detalleComisiones.refunds.length}):</p>
              <div className="space-y-1">
                {detalleComisiones.refunds.map((r) => {
                  const isExcluded = skipRefundIds.has(r.payment_id);
                  return (
                    <div key={r.payment_id} className="flex items-center justify-between gap-2 text-xs">
                      <span className={isExcluded ? "text-[var(--muted)] line-through" : "text-white"}>
                        {r.cliente} — ${r.monto.toLocaleString()} · {r.closer_nombre && `closer −$${Math.round(r.desc_closer).toLocaleString()}`} {r.setter_nombre && `· setter −$${Math.round(r.desc_setter).toLocaleString()}`}
                      </span>
                      <button
                        onClick={() => excluirRefund(r.payment_id)}
                        className={`text-[10px] px-2 py-0.5 rounded ${isExcluded ? "bg-white/10 text-white" : "bg-amber-500/30 text-amber-200"}`}
                      >
                        {isExcluded ? "Incluir" : "Excluir"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-2">
                Marcá "Excluir" si el refund ya se descontó en otro mes. Luego usá "Marcar refunds aplicados" para que no aparezcan en cierres futuros.
              </p>
            </div>
          )}

          <textarea
            readOnly
            value={mensajeWA}
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 text-[11px] font-mono text-white whitespace-pre"
            rows={Math.min(30, mensajeWA.split("\n").length + 1)}
          />
        </div>
      )}

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {breakdownPorMiembro.map((b) => (
          <div key={b.member.id} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-white font-semibold">{b.member.nombre}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.multiplier === 1.3 ? "bg-yellow-400/20 text-yellow-300" : b.multiplier === 1.15 ? "bg-blue-400/20 text-blue-300" : "bg-white/10 text-[var(--muted)]"}`}>
                ×{b.multiplier}
              </span>
            </div>
            <p className="text-2xl font-bold text-[var(--green)]">{formatUSD(b.totalGeneral)}</p>
            <p className="text-[10px] text-[var(--muted)] mt-1">
              Cash closer: {formatUSD(b.cashClosed)} · Setter: {formatUSD(b.cashAsSetter)}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              Tier: Omni {b.tierPct.omni}% · Multi {b.tierPct.multi}% · Consult {b.tierPct.consultoria}%
            </p>
          </div>
        ))}
      </div>

      {/* Detalle por miembro */}
      {breakdownPorMiembro.map((b) => (
        <div key={b.member.id} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{b.member.nombre}</h2>
              <p className="text-xs text-[var(--muted)]">
                Multiplicador {b.multiplier}× · {b.ventasComoCloser.length} ventas como closer · {b.ventasComoSetter.length} ventas como setter
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--muted)]">Comisión total</p>
              <p className="text-xl font-bold text-[var(--green)]">{formatUSD(b.totalGeneral)}</p>
            </div>
          </div>

          {b.ventasComoCloser.length > 0 && (
            <div className="border-b border-[var(--card-border)]">
              <div className="px-6 py-2 bg-[var(--purple)]/5 text-xs font-semibold text-[var(--purple-light)] uppercase">
                Closer ({b.ventasComoCloser.length}) — Total: {formatUSD(b.totalCloser)}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--background)] text-left text-[10px] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Lead</th>
                      <th className="py-2 px-3">Programa</th>
                      <th className="py-2 px-3 text-center">Cuota</th>
                      <th className="py-2 px-3">Receptor</th>
                      <th className="py-2 px-3 text-right">Monto</th>
                      <th className="py-2 px-3 text-right">%</th>
                      <th className="py-2 px-3 text-right">Comisión</th>
                      <th className="py-2 px-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.ventasComoCloser.map((v) => (
                      <tr key={v.paymentId} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                        <td className="py-2 px-3 text-[var(--muted)] text-xs">{v.fecha}</td>
                        <td className="py-2 px-3 text-white text-xs">
                          <button onClick={() => setEditingLeadId(v.leadId)} className="hover:text-[var(--purple-light)] text-left">
                            {v.leadName}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-[var(--muted)] text-xs">{v.programa || "—"}</td>
                        <td className="py-2 px-3 text-center text-[var(--muted)] text-xs">#{v.cuota}</td>
                        <td className="py-2 px-3 text-xs">
                          <input
                            type="text"
                            defaultValue={v.receptor || ""}
                            placeholder="—"
                            onBlur={(e) => {
                              const newVal = e.target.value.trim();
                              if (newVal !== (v.receptor || "")) patchPayment(v.paymentId, "receptor", newVal || null);
                            }}
                            className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1.5 py-0.5 text-xs text-[var(--muted)] focus:text-white focus:outline-none w-24"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-white">{formatUSD(v.monto)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-[var(--purple-light)]">{v.pctAplicado.toFixed(2)}%</td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-bold text-[var(--green)]">{formatUSD(v.comision)}</td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button onClick={() => setEditingLeadId(v.leadId)} title="Editar lead"
                            className="text-[10px] bg-[var(--purple)]/20 hover:bg-[var(--purple)]/40 text-[var(--purple-light)] px-2 py-0.5 rounded">
                            ✏️
                          </button>
                          <button onClick={() => setEditingPaymentId(v.paymentId)} title="Editar pago"
                            className="ml-1 text-[10px] bg-[var(--green)]/15 hover:bg-[var(--green)]/35 text-[var(--green)] px-2 py-0.5 rounded">
                            📝
                          </button>
                          <button onClick={() => handleDeletePayment(v.paymentId, v.leadName)}
                            disabled={deletingPayment === v.paymentId}
                            title="Eliminar pago"
                            className="ml-1 text-[10px] bg-[var(--red)]/15 hover:bg-[var(--red)]/35 text-[var(--red)] px-2 py-0.5 rounded disabled:opacity-50">
                            {deletingPayment === v.paymentId ? "..." : "🗑️"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {b.ventasComoSetter.length > 0 && (
            <div>
              <div className="px-6 py-2 bg-[var(--green)]/5 text-xs font-semibold text-[var(--green)] uppercase">
                Setter (3%) ({b.ventasComoSetter.length}) — Total: {formatUSD(b.totalSetter)}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--background)] text-left text-[10px] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Lead</th>
                      <th className="py-2 px-3 text-center">Cuota</th>
                      <th className="py-2 px-3">Receptor</th>
                      <th className="py-2 px-3 text-right">Monto</th>
                      <th className="py-2 px-3 text-right">%</th>
                      <th className="py-2 px-3 text-right">Comisión</th>
                      <th className="py-2 px-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.ventasComoSetter.map((v) => (
                      <tr key={v.paymentId} className="border-t border-[var(--card-border)]/30 hover:bg-white/5">
                        <td className="py-2 px-3 text-[var(--muted)] text-xs">{v.fecha}</td>
                        <td className="py-2 px-3 text-white text-xs">
                          <button onClick={() => setEditingLeadId(v.leadId)} className="hover:text-[var(--purple-light)] text-left">
                            {v.leadName}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-center text-[var(--muted)] text-xs">#{v.cuota}</td>
                        <td className="py-2 px-3 text-xs">
                          <input
                            type="text"
                            defaultValue={v.receptor || ""}
                            placeholder="—"
                            onBlur={(e) => {
                              const newVal = e.target.value.trim();
                              if (newVal !== (v.receptor || "")) patchPayment(v.paymentId, "receptor", newVal || null);
                            }}
                            className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1.5 py-0.5 text-xs text-[var(--muted)] focus:text-white focus:outline-none w-24"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-white">{formatUSD(v.monto)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-[var(--green)]">3,00%</td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-bold text-[var(--green)]">{formatUSD(v.comision)}</td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button onClick={() => setEditingLeadId(v.leadId)} title="Editar lead"
                            className="text-[10px] bg-[var(--purple)]/20 hover:bg-[var(--purple)]/40 text-[var(--purple-light)] px-2 py-0.5 rounded">
                            ✏️
                          </button>
                          <button onClick={() => setEditingPaymentId(v.paymentId)} title="Editar pago"
                            className="ml-1 text-[10px] bg-[var(--green)]/15 hover:bg-[var(--green)]/35 text-[var(--green)] px-2 py-0.5 rounded">
                            📝
                          </button>
                          <button onClick={() => handleDeletePayment(v.paymentId, v.leadName)}
                            disabled={deletingPayment === v.paymentId}
                            title="Eliminar pago"
                            className="ml-1 text-[10px] bg-[var(--red)]/15 hover:bg-[var(--red)]/35 text-[var(--red)] px-2 py-0.5 rounded disabled:opacity-50">
                            {deletingPayment === v.paymentId ? "..." : "🗑️"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}

      {breakdownPorMiembro.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
          Sin comisiones para este periodo
        </div>
      )}

      {editingLead && (
        <LeadEditModal
          lead={editingLead}
          closers={closers}
          setters={setters}
          onClose={() => setEditingLeadId(null)}
          onSaved={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === editingLead.id ? { ...l, ...updated } as LeadLite : l)));
          }}
        />
      )}

      {showAddPayment && (
        <AddPaymentModal
          leads={leads.map((l) => ({ id: l.id, nombre: l.nombre }))}
          onClose={() => setShowAddPayment(false)}
          onCreated={(p: PaymentResult) => {
            setPayments((prev) => [...prev, p as PaymentRow]);
          }}
        />
      )}

      {showAddLead && (
        <AddLeadModal
          closers={closers}
          setters={setters}
          onClose={() => setShowAddLead(false)}
          onCreated={() => { setShowAddLead(false); window.location.reload(); }}
        />
      )}

      {editingPayment && (
        <PaymentEditModalShared
          payment={editingPayment}
          onClose={() => setEditingPaymentId(null)}
          onSaved={(updated) => {
            setPayments((prev) => prev.map((p) => (p.id === editingPayment.id ? { ...p, ...updated } as PaymentRow : p)));
          }}
          onDeleted={(id) => {
            setPayments((prev) => prev.filter((p) => p.id !== id));
          }}
        />
      )}
    </div>
  );
}
