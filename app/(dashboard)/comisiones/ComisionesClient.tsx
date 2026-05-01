"use client";

import { useMemo, useState } from "react";
import MonthSelector77 from "@/app/components/MonthSelector77";
import LeadEditModal, { type EditableLead } from "@/app/components/LeadEditModal";
import { formatUSD } from "@/lib/format";
import { computeValenCommission, SETTER_PCT } from "@/lib/commissions";
import { getFiscalStart, getFiscalMonth, parseLocalDate } from "@/lib/date-utils";
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
  const closers = useMemo(() => team.filter((t) => t.is_closer), [team]);
  const setters = useMemo(() => team.filter((t) => t.is_setter), [team]);
  const editingLead = useMemo<EditableLead | null>(() => {
    if (!editingLeadId) return null;
    const l = leads.find((x) => x.id === editingLeadId);
    return l ? (l as unknown as EditableLead) : null;
  }, [editingLeadId, leads]);

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

  const monthRange = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: toStr(start), end: toStr(end) };
  }, [selectedMonth]);

  const currentLabel = useMemo(() => getFiscalMonth(parseLocalDate(selectedMonth)), [selectedMonth]);

  const leadById = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);
  const mediumToSetter = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaigns) if (c.setter_id && c.medium) m.set(c.medium.toLowerCase(), c.setter_id);
    return m;
  }, [campaigns]);

  // Filtrar pagos del mes seleccionado
  const monthPayments = useMemo(() => {
    return payments.filter(p => {
      if (!p.fecha_pago || !p.lead_id) return false;
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
        <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
      </div>

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
                        <td className="py-2 px-3 text-[var(--muted)] text-xs">{v.receptor || "—"}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-white">{formatUSD(v.monto)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-[var(--purple-light)]">{v.pctAplicado.toFixed(2)}%</td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-bold text-[var(--green)]">{formatUSD(v.comision)}</td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button onClick={() => setEditingLeadId(v.leadId)} title="Editar lead"
                            className="text-[10px] bg-[var(--purple)]/20 hover:bg-[var(--purple)]/40 text-[var(--purple-light)] px-2 py-0.5 rounded">
                            ✏️
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
                        <td className="py-2 px-3 text-[var(--muted)] text-xs">{v.receptor || "—"}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-white">{formatUSD(v.monto)}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs text-[var(--green)]">3,00%</td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-bold text-[var(--green)]">{formatUSD(v.comision)}</td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button onClick={() => setEditingLeadId(v.leadId)} title="Editar lead"
                            className="text-[10px] bg-[var(--purple)]/20 hover:bg-[var(--purple)]/40 text-[var(--purple-light)] px-2 py-0.5 rounded">
                            ✏️
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
    </div>
  );
}
