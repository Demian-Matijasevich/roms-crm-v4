"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { formatUSD, formatARS, formatMoney, formatDate } from "@/lib/format";
import {
  getFiscalStart,
  getFiscalMonth,
  getFiscalMonthOptions,
  parseLocalDate,
} from "@/lib/date-utils";
import { RECEPTORES } from "@/lib/constants";
import type { MonthlyCash, TreasuryRow, Commission } from "@/lib/types";
import type { GastoRow, IngresoRow } from "./page";

interface PaymentRow {
  id: string;
  monto_usd: number;
  receptor: string | null;
  fecha_pago: string | null;
  estado: string;
  metodo_pago: string | null;
  lead_id?: string | null;
}

interface LeadForPro {
  id: string;
  programa_pitcheado: string | null;
  ticket_total: number;
  estado: string | null;
  fecha_llamada: string | null;
}

interface ClientForPro {
  id: string;
  lead_id: string | null;
  programa: string | null;
  fecha_onboarding: string | null;
  fecha_offboarding: string | null;
  total_dias_programa: number;
  estado: string;
}

interface Props {
  monthlyCash: MonthlyCash[];
  commissions: Commission[];
  treasury: TreasuryRow[];
  gastos: GastoRow[];
  ingresos: IngresoRow[];
  usdRate: number;
  payments: PaymentRow[];
  leadsForPro: LeadForPro[];
  clientsForPro: ClientForPro[];
  usdRateHistory: Array<{ mes: string; rate: number }>;
  currentFiscalMonth: string;
}

const RECEPTOR_COLORS: Record<string, string> = {
  "Mercado Pago": "#8b5cf6",
  Transferencia: "#10b981",
  Cash: "#ef4444",
  Binance: "#f59e0b",
  Stripe: "#3b82f6",
  Wise: "#06b6d4",
};

function gastoFiscalMonth(fecha: string): string {
  const d = parseLocalDate(fecha);
  return getFiscalMonth(d);
}

export default function FinanzasClient({
  monthlyCash,
  commissions,
  treasury,
  gastos,
  ingresos,
  usdRate: initialUsdRate,
  payments,
  leadsForPro,
  clientsForPro,
  usdRateHistory: initialRates,
  currentFiscalMonth,
}: Props) {
  const [rates, setRates] = useState(initialRates);
  const [newRateMes, setNewRateMes] = useState<string>(new Date().toISOString().slice(0, 7));
  const [newRateValue, setNewRateValue] = useState<string>("");

  async function saveMonthRate() {
    const r = Number(newRateValue);
    if (!Number.isFinite(r) || r <= 0) { alert("Rate inválido"); return; }
    const res = await fetch("/api/usd-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: newRateMes, rate: r }),
    });
    const json = await res.json();
    if (json.ok) {
      setRates((prev) => {
        const filtered = prev.filter((x) => x.mes !== newRateMes);
        return [...filtered, { mes: newRateMes, rate: r }].sort((a, b) => b.mes.localeCompare(a.mes));
      });
      setNewRateValue("");
    } else {
      alert("Error: " + (json.error || ""));
    }
  }

  async function deleteMonthRate(mes: string) {
    if (!confirm(`¿Borrar rate de ${mes}?`)) return;
    const res = await fetch(`/api/usd-rates?mes=${encodeURIComponent(mes)}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setRates((prev) => prev.filter((r) => r.mes !== mes));
    else alert("Error: " + (json.error || ""));
  }
  const [usdRate, setUsdRate] = useState(initialUsdRate);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(String(initialUsdRate));
  const [savingRate, setSavingRate] = useState(false);

  async function saveUsdRate() {
    const val = parseFloat(rateInput);
    if (!Number.isFinite(val) || val <= 0) return;
    setSavingRate(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "usd_ars_rate", value: val }),
    });
    const json = await res.json();
    setSavingRate(false);
    if (json.ok) {
      setUsdRate(val);
      setEditingRate(false);
    }
  }
  const [selectedMonth, setSelectedMonth] = useState(
    getFiscalStart().toISOString().split("T")[0]
  );
  const [showGastoForm, setShowGastoForm] = useState(false);
  const [gastoForm, setGastoForm] = useState({
    fecha: new Date().toISOString().split("T")[0],
    concepto: "",
    categoria: "",
    monto_usd: "",
    monto_ars: "",
    billetera: "",
    pagado_a: "",
    pagado_por: "",
    estado: "pagado",
  });
  const [submitting, setSubmitting] = useState(false);
  const [localGastos, setLocalGastos] = useState<GastoRow[]>(gastos);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localIngresos, setLocalIngresos] = useState<IngresoRow[]>(ingresos);
  const [localPayments, setLocalPayments] = useState<PaymentRow[]>(payments);
  const RECEPTOR_OPTIONS = ["FRAN", "JUANMA", "VALEN", "MEL"];

  async function deletePayment(paymentId: string, leadName: string | null, monto: number) {
    const label = leadName ? `${leadName} - $${monto}` : `pago $${monto}`;
    if (!confirm(`¿Borrar ${label}? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/pagos?id=${paymentId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setLocalIngresos((prev) => prev.filter((i) => i.id !== paymentId));
      setLocalPayments((prev) => prev.filter((p) => p.id !== paymentId));
    } else {
      alert("Error al borrar: " + (json.error || "desconocido"));
    }
  }

  // Generic payment field updater
  async function updatePaymentField(paymentId: string, field: string, value: string | number | boolean | null) {
    try {
      const res = await fetch("/api/pagos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocalIngresos((prev) => prev.map((i) => (i.id === paymentId ? { ...i, [field]: value } : i)));
        setLocalPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, [field]: value } : p)));
        return true;
      } else {
        alert("Error: " + (json.error || "desconocido"));
        return false;
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
      return false;
    }
  }

  // Ingresos table filters
  const [ingresoSearch, setIngresoSearch] = useState("");
  const [ingresoMetodo, setIngresoMetodo] = useState("todos");
  const [ingresoReceptor, setIngresoReceptor] = useState("todos");

  // Gastos table filters
  const [gastoSearch, setGastoSearch] = useState("");
  const [gastoCategoria, setGastoCategoria] = useState("todos");
  const [gastoEstado, setGastoEstado] = useState("todos");

  // Generic gasto field updater
  async function updateGastoField(gastoId: string, field: string, value: string | number | null) {
    try {
      const res = await fetch("/api/gastos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gastoId, [field]: value }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocalGastos((prev) => prev.map((g) => (g.id === gastoId ? { ...g, [field]: value } : g)));
      } else {
        alert("Error: " + (json.error || "desconocido"));
      }
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const currentLabel = useMemo(() => {
    return getFiscalMonth(parseLocalDate(selectedMonth));
  }, [selectedMonth]);

  // Range calendario del mes seleccionado (start/end YYYY-MM-DD)
  const monthRange = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: toStr(start), end: toStr(end) };
  }, [selectedMonth]);

  // ────── PRO METRICS: Ventas / Cash Collected / Revenue Devengado por programa ──────
  const proMetrics = useMemo(() => {
    const init = () => ({ omnipresencia: 0, multicuentas: 0, consultoria: 0, roms_7: 0, otros: 0, total: 0 });
    const ventas = init();
    const cash = init();
    const revenue = init();

    function bucketKey(programa: string | null): keyof ReturnType<typeof init> {
      const p = (programa || "").toLowerCase();
      if (p.includes("multi")) return "multicuentas";
      if (p.includes("consult")) return "consultoria";
      if (p.includes("omni")) return "omnipresencia";
      if (p.includes("roms_7") || p === "roms_7") return "roms_7";
      return "otros";
    }

    // 1) VENTAS DEL MES — leads cerrados en el mes (por fecha_llamada)
    for (const l of leadsForPro) {
      if (!l.fecha_llamada) continue;
      const f = l.fecha_llamada.split("T")[0];
      if (f < monthRange.start || f > monthRange.end) continue;
      if (l.estado !== "cerrado" && l.estado !== "adentro_seguimiento") continue;
      const k = bucketKey(l.programa_pitcheado);
      ventas[k] += l.ticket_total || 0;
      ventas.total += l.ticket_total || 0;
    }

    // 2) CASH COLLECTED — payments pagados en el mes, agrupados por programa del lead
    const leadProgramaMap = new Map<string, string | null>();
    for (const l of leadsForPro) leadProgramaMap.set(l.id, l.programa_pitcheado);
    for (const p of payments) {
      if (!p.fecha_pago) continue;
      const f = p.fecha_pago.split("T")[0];
      if (f < monthRange.start || f > monthRange.end) continue;
      const programa = p.lead_id ? leadProgramaMap.get(p.lead_id) : null;
      const k = bucketKey(programa || null);
      cash[k] += p.monto_usd || 0;
      cash.total += p.monto_usd || 0;
    }

    // 3) REVENUE DEVENGADO — para cada cliente, días del programa que cayeron en el mes
    const leadTicketMap = new Map<string, number>();
    for (const l of leadsForPro) leadTicketMap.set(l.id, l.ticket_total || 0);
    const monthStart = parseLocalDate(monthRange.start).getTime();
    const monthEnd = parseLocalDate(monthRange.end).getTime();
    const DAY = 86400000;
    for (const c of clientsForPro) {
      if (!c.fecha_onboarding || !c.lead_id) continue;
      const ticket = leadTicketMap.get(c.lead_id) || 0;
      if (ticket <= 0) continue;
      const onb = parseLocalDate(c.fecha_onboarding.split("T")[0]).getTime();
      const programEnd = c.fecha_offboarding
        ? parseLocalDate(c.fecha_offboarding.split("T")[0]).getTime()
        : onb + (c.total_dias_programa || 90) * DAY;
      // Overlap del programa con el mes seleccionado
      const overlapStart = Math.max(onb, monthStart);
      const overlapEnd = Math.min(programEnd, monthEnd);
      if (overlapEnd < overlapStart) continue;
      const overlapDays = Math.floor((overlapEnd - overlapStart) / DAY) + 1;
      const totalDays = c.total_dias_programa || 90;
      const monthRevenue = (overlapDays / totalDays) * ticket;
      const k = bucketKey(c.programa);
      revenue[k] += monthRevenue;
      revenue.total += monthRevenue;
    }

    return { ventas, cash, revenue };
  }, [leadsForPro, clientsForPro, payments, monthRange]);

  // ────── P&L DATA ──────
  const monthCash = useMemo(
    () => monthlyCash.find((m) => m.mes_fiscal === currentLabel),
    [monthlyCash, currentLabel]
  );

  const monthCommissions = useMemo(
    () => commissions.filter((c) => c.mes_fiscal === currentLabel),
    [commissions, currentLabel]
  );

  const monthIngresos = useMemo(() => {
    let arr = localIngresos.filter((i) => i.fecha_pago && gastoFiscalMonth(i.fecha_pago.split("T")[0]) === currentLabel);
    if (ingresoSearch) {
      const q = ingresoSearch.toLowerCase();
      arr = arr.filter((i) => (i.lead_nombre || "").toLowerCase().includes(q) || (i.receptor || "").toLowerCase().includes(q));
    }
    if (ingresoMetodo !== "todos") arr = arr.filter((i) => (i.metodo_pago || "") === ingresoMetodo);
    if (ingresoReceptor !== "todos") arr = arr.filter((i) => (i.receptor || "") === ingresoReceptor);
    return arr;
  }, [localIngresos, currentLabel, ingresoSearch, ingresoMetodo, ingresoReceptor]);

  const totalIngresosMes = useMemo(() => {
    let usd = 0;
    let ars = 0;
    for (const i of monthIngresos) {
      usd += i.monto_usd || 0;
      ars += i.monto_ars || 0;
    }
    return { usd, ars };
  }, [monthIngresos]);

  const monthGastos = useMemo(() => {
    let arr = localGastos.filter((g) => gastoFiscalMonth(g.fecha) === currentLabel);
    if (gastoSearch) {
      const q = gastoSearch.toLowerCase();
      arr = arr.filter((g) =>
        (g.concepto || "").toLowerCase().includes(q) ||
        (g.categoria || "").toLowerCase().includes(q) ||
        (g.pagado_a || "").toLowerCase().includes(q) ||
        (g.pagado_por || "").toLowerCase().includes(q) ||
        (g.billetera || "").toLowerCase().includes(q)
      );
    }
    if (gastoCategoria !== "todos") arr = arr.filter((g) => (g.categoria || "") === gastoCategoria);
    if (gastoEstado !== "todos") arr = arr.filter((g) => (g.estado || "") === gastoEstado);
    return arr;
  }, [localGastos, currentLabel, gastoSearch, gastoCategoria, gastoEstado]);

  const gastoCategoriasUnique = useMemo(() => {
    const set = new Set<string>();
    for (const g of localGastos) if (g.categoria) set.add(g.categoria);
    return [...set].sort();
  }, [localGastos]);

  // Ingresos
  const cashVentasNuevas = monthCash?.cash_ventas_nuevas ?? 0;
  const cashCuotas = monthCash?.cash_cuotas ?? 0;
  const cashRenovaciones = monthCash?.cash_renovaciones ?? 0;
  const totalIngresos = cashVentasNuevas + cashCuotas + cashRenovaciones;

  // Egresos
  const totalGastosOp = monthGastos.reduce((s, g) => s + (g.monto_usd || 0), 0);
  const totalComisionesClosers = monthCommissions.reduce(
    (s, c) => s + c.comision_closer,
    0
  );
  const totalComisionesSetters = monthCommissions.reduce(
    (s, c) => s + c.comision_setter,
    0
  );
  const totalEgresos =
    totalGastosOp + totalComisionesClosers + totalComisionesSetters;

  const resultadoNeto = totalIngresos - totalEgresos;
  const esPositivo = resultadoNeto >= 0;

  // ────── GASTOS BY CATEGORY ──────
  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of monthGastos) {
      const cat = g.categoria || "Sin categoria";
      map.set(cat, (map.get(cat) || 0) + (g.monto_usd || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [monthGastos]);

  // ────── CASH FLOW: Quien gasto / Quien recibio ──────
  const gastosPorPersona = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const g of monthGastos) {
      const persona = g.pagado_por?.trim() || g.pagado_a?.trim() || "Sin asignar";
      if (!map.has(persona)) map.set(persona, { count: 0, total: 0 });
      const p = map.get(persona)!;
      p.count++;
      p.total += g.monto_usd || 0;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [monthGastos]);

  const monthPayments = useMemo(() => {
    return localPayments.filter((p) => {
      if (!p.fecha_pago) return false;
      return getFiscalMonth(parseLocalDate(p.fecha_pago)) === currentLabel;
    });
  }, [localPayments, currentLabel]);

  const ingresosPorReceptor = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const p of monthPayments) {
      if (p.monto_usd <= 0) continue;
      const receptor = p.receptor?.trim() || "Sin asignar";
      if (!map.has(receptor)) map.set(receptor, { count: 0, total: 0 });
      const r = map.get(receptor)!;
      r.count++;
      r.total += p.monto_usd;
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [monthPayments]);

  // ────── TREASURY ──────
  const filteredTreasury = useMemo(
    () => treasury.filter((r) => r.mes_fiscal === currentLabel),
    [treasury, currentLabel]
  );

  const byReceptor = useMemo(() => {
    const map: Record<string, { total_usd: number; total_ars: number }> = {};
    for (const r of filteredTreasury) {
      if (!map[r.receptor])
        map[r.receptor] = { total_usd: 0, total_ars: 0 };
      map[r.receptor].total_usd += r.total_usd ?? 0;
      map[r.receptor].total_ars += r.total_ars ?? 0;
    }
    return Object.entries(map)
      .map(([receptor, totals]) => ({ receptor, ...totals }))
      .sort((a, b) => b.total_usd - a.total_usd);
  }, [filteredTreasury]);

  const grandTotalUSD = byReceptor.reduce((s, r) => s + r.total_usd, 0);
  const grandTotalARS = byReceptor.reduce((s, r) => s + r.total_ars, 0);

  // ────── MONTHLY CHART ──────
  const chartData = useMemo(() => {
    const months = getFiscalMonthOptions(6).reverse();
    return months.map((m) => {
      const mc = monthlyCash.find((c) => c.mes_fiscal === m.label);
      const gast = localGastos
        .filter((g) => gastoFiscalMonth(g.fecha) === m.label)
        .reduce((s, g) => s + (g.monto_usd || 0), 0);
      return {
        mes: m.label,
        Ingresos: mc ? mc.cash_ventas_nuevas + mc.cash_cuotas + mc.cash_renovaciones : 0,
        Gastos: gast,
      };
    });
  }, [monthlyCash, localGastos]);

  // ────── FORM SUBMIT ──────
  async function handleSubmitGasto(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const isEdit = editingId != null;
      const res = await fetch("/api/gastos", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: editingId } : {}),
          ...gastoForm,
          monto_usd: parseFloat(gastoForm.monto_usd) || 0,
          monto_ars: parseFloat(gastoForm.monto_ars) || 0,
        }),
      });
      const data = await res.json();
      if (data.ok && data.gasto) {
        if (isEdit) {
          setLocalGastos((prev) => prev.map((g) => (g.id === editingId ? data.gasto : g)));
        } else {
          setLocalGastos((prev) => [data.gasto, ...prev]);
        }
        setShowGastoForm(false);
        setEditingId(null);
        setGastoForm({
          fecha: new Date().toISOString().split("T")[0],
          concepto: "",
          categoria: "",
          monto_usd: "",
          monto_ars: "",
          billetera: "",
          pagado_a: "",
          pagado_por: "",
          estado: "pagado",
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteGasto(id: string) {
    if (!confirm("¿Borrar este gasto?")) return;
    const res = await fetch(`/api/gastos?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setLocalGastos((prev) => prev.filter((g) => g.id !== id));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Finanzas</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Estado de resultados, gastos y tesoreria &mdash; {currentLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* USD rate */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">USD:</span>
            {editingRate ? (
              <>
                <input
                  type="number"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-20 bg-transparent border-b border-[var(--purple)] text-sm text-white focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={saveUsdRate}
                  disabled={savingRate}
                  className="text-xs text-[var(--purple)] hover:underline disabled:opacity-50"
                >
                  {savingRate ? "..." : "OK"}
                </button>
                <button onClick={() => { setEditingRate(false); setRateInput(String(usdRate)); }} className="text-xs text-[var(--muted)]">✕</button>
              </>
            ) : (
              <>
                <span className="text-sm text-white font-medium">{formatARS(usdRate)}</span>
                <button onClick={() => setEditingRate(true)} className="text-xs text-[var(--purple)] hover:underline">
                  editar
                </button>
              </>
            )}
          </div>
          <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
        </div>
      </div>

      {/* ══════════════ RESUMEN PRO: Ventas / Cash / Revenue Devengado ══════════════ */}
      <div className="bg-gradient-to-br from-[var(--card-bg)] via-[var(--card-bg)] to-[var(--purple)]/5 border border-[var(--purple)]/30 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">📊 Resumen del mes — {currentLabel}</h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              3 métricas distintas que NO son lo mismo (ver tooltip en cada una)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProMetricCard
            label="Ventas del mes"
            help="Suma del ticket total de todos los leads que se cerraron en el mes (estado=cerrado o adentro_seguimiento, fecha_llamada en el mes). Es lo que se VENDIÓ — independiente de si ya cobramos."
            color="purple"
            data={proMetrics.ventas}
          />
          <ProMetricCard
            label="Cash Collected"
            help="Suma de pagos efectivamente cobrados en el mes (estado=pagado, fecha_pago en el mes). Es lo que ENTRÓ a caja — incluye pagos de ventas viejas (cuotas) y excluye ventas nuevas no cobradas."
            color="green"
            data={proMetrics.cash}
          />
          <ProMetricCard
            label="Revenue Devengado"
            help="Porción del servicio efectivamente prestada en el mes. Para cada cliente activo: (días del programa que cayeron en el mes / total días) × ticket. Es lo que GANAMOS contablemente este mes."
            color="blue"
            data={proMetrics.revenue}
          />
        </div>

        {/* Tabla comparativa por programa */}
        <div className="mt-5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                <th className="py-2 px-3">Programa</th>
                <th className="py-2 px-3 text-right">Ventas</th>
                <th className="py-2 px-3 text-right">Cash Collected</th>
                <th className="py-2 px-3 text-right">Revenue Devengado</th>
              </tr>
            </thead>
            <tbody>
              {(["omnipresencia", "multicuentas", "consultoria", "roms_7", "otros"] as const).map((k) => {
                const v = proMetrics.ventas[k];
                const c = proMetrics.cash[k];
                const r = proMetrics.revenue[k];
                if (v === 0 && c === 0 && r === 0) return null;
                const labels: Record<string, string> = {
                  omnipresencia: "Omnipresencia", multicuentas: "Multicuentas",
                  consultoria: "Consultoría", roms_7: "ROMS 7", otros: "Otros / sin programa",
                };
                return (
                  <tr key={k} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-3 text-white font-medium">{labels[k]}</td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--purple-light)]">{formatUSD(Math.round(v))}</td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{formatUSD(Math.round(c))}</td>
                    <td className="py-2 px-3 text-right font-mono text-blue-400">{formatUSD(Math.round(r))}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--card-border)] font-bold">
                <td className="py-2 px-3 text-white">TOTAL</td>
                <td className="py-2 px-3 text-right font-mono text-[var(--purple-light)]">{formatUSD(Math.round(proMetrics.ventas.total))}</td>
                <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{formatUSD(Math.round(proMetrics.cash.total))}</td>
                <td className="py-2 px-3 text-right font-mono text-blue-400">{formatUSD(Math.round(proMetrics.revenue.total))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[var(--muted)]">
          <div className="bg-[var(--background)] border border-[var(--purple-light)]/20 rounded-lg p-2.5">
            <span className="text-[var(--purple-light)] font-semibold">Ventas:</span> ¿Vendimos bien este mes?
          </div>
          <div className="bg-[var(--background)] border border-[var(--green)]/20 rounded-lg p-2.5">
            <span className="text-[var(--green)] font-semibold">Cash:</span> ¿Cuánto entró a caja?
          </div>
          <div className="bg-[var(--background)] border border-blue-400/20 rounded-lg p-2.5">
            <span className="text-blue-400 font-semibold">Devengado:</span> ¿Cuánto ganamos contablemente?
          </div>
        </div>
      </div>

      {/* ══════════════ USD RATE POR MES ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">💱 USD/ARS por mes</h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              Cuando cargás un gasto en ARS, se convierte a USD usando el rate del mes del gasto. Si no hay rate cargado para ese mes, usa el global ({usdRate} ARS/USD).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={newRateMes} onChange={(e) => setNewRateMes(e.target.value)}
              className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-sm text-white" />
            <input type="number" value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)}
              placeholder="Rate ARS/USD" min={0} step={1}
              className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-sm text-white w-32" />
            <button onClick={saveMonthRate}
              className="text-sm bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-1.5 rounded">
              Guardar
            </button>
          </div>
        </div>
        {rates.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">Sin rates cargados. Usá el form de arriba para empezar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="py-2 px-3">Mes</th>
                  <th className="py-2 px-3 text-right">Rate (ARS/USD)</th>
                  <th className="py-2 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.mes} className="border-t border-[var(--card-border)]/30">
                    <td className="py-2 px-3 text-white font-medium">{r.mes}</td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--green)]">{Number(r.rate).toLocaleString("en-US")}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => deleteMonthRate(r.mes)}
                        className="text-xs bg-[var(--red)]/15 hover:bg-[var(--red)]/35 text-[var(--red)] px-2 py-0.5 rounded">
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════ P&L ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">
          Estado de Resultados
        </h2>

        {/* Ingresos */}
        <p className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Ingresos
        </p>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Cash Collected (ventas nuevas)</span>
            <span className="text-white">{formatUSD(cashVentasNuevas)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Cash Collected (cuotas)</span>
            <span className="text-white">{formatUSD(cashCuotas)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Cash Collected (renovaciones)</span>
            <span className="text-white">{formatUSD(cashRenovaciones)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-[var(--green)]">
            <span>Total Ingresos</span>
            <span>{formatUSD(totalIngresos)}</span>
          </div>
        </div>

        {/* Egresos */}
        <p className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Egresos
        </p>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Gastos Operativos</span>
            <span className="text-white">{formatUSD(totalGastosOp)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Comisiones Closers</span>
            <span className="text-white">{formatUSD(totalComisionesClosers)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/80">Comisiones Setters</span>
            <span className="text-white">{formatUSD(totalComisionesSetters)}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-[var(--red)]">
            <span>Total Egresos</span>
            <span>{formatUSD(totalEgresos)}</span>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-[var(--card-border)] my-4" />

        {/* Resultado Neto */}
        <div
          className={`flex justify-between text-2xl font-bold ${
            esPositivo ? "text-[var(--green)]" : "text-[var(--red)]"
          }`}
        >
          <span>Resultado Neto</span>
          <span>{formatUSD(resultadoNeto)}</span>
        </div>
      </div>

      {/* ══════════════ COMISIONES POR EMPLEADO ══════════════ */}
      {monthCommissions.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">
            Comisiones por Empleado
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {monthCommissions.map((c) => (
              <div
                key={c.team_member_id}
                className="flex items-center justify-between bg-white/5 rounded-lg p-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">{c.nombre}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Closer: {formatUSD(c.comision_closer)} &middot; Setter:{" "}
                    {formatUSD(c.comision_setter)}
                  </p>
                </div>
                <p className="text-sm font-bold text-[var(--green)]">
                  {formatUSD(c.comision_total)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-bold pt-3 border-t border-[var(--card-border)]">
            <span className="text-[var(--muted)]">Total Comisiones</span>
            <span className="text-[var(--purple-light)]">
              {formatUSD(totalComisionesClosers + totalComisionesSetters)}
            </span>
          </div>
        </div>
      )}

      {/* ══════════════ CASH FLOW ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quien gasto */}
        {gastosPorPersona.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">
              Quien gasto
            </h2>
            <div className="space-y-3">
              {gastosPorPersona.map(([persona, data]) => (
                <div
                  key={persona}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 flex items-center justify-center text-xs font-bold text-[var(--red)]">
                      {persona.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {persona}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {data.count} gasto{data.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[var(--red)]">
                    {formatUSD(data.total)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold pt-3 mt-3 border-t border-[var(--card-border)]">
              <span className="text-[var(--muted)]">Total</span>
              <span className="text-[var(--red)]">
                {formatUSD(
                  gastosPorPersona.reduce((s, [, d]) => s + d.total, 0)
                )}
              </span>
            </div>
          </div>
        )}

        {/* Quien recibio */}
        {ingresosPorReceptor.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">
              Quien recibio
            </h2>
            <div className="space-y-3">
              {ingresosPorReceptor.map(([receptor, data]) => (
                <div
                  key={receptor}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--green)]/10 flex items-center justify-center text-xs font-bold text-[var(--green)]">
                      {receptor.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {receptor}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">
                        {data.count} pago{data.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[var(--green)]">
                    {formatUSD(data.total)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold pt-3 mt-3 border-t border-[var(--card-border)]">
              <span className="text-[var(--muted)]">Total</span>
              <span className="text-[var(--green)]">
                {formatUSD(
                  ingresosPorReceptor.reduce((s, [, d]) => s + d.total, 0)
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ TESORERIA ══════════════ */}
      {byReceptor.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Tesoreria &mdash; Donde esta la plata
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
            {byReceptor.map((r) => (
              <div
                key={r.receptor}
                className="bg-white/5 border border-[var(--card-border)] rounded-lg p-4"
              >
                <p className="text-xs text-[var(--muted)] uppercase mb-1">
                  {r.receptor}
                </p>
                <p className="text-xl font-bold text-white">
                  {formatUSD(r.total_usd)}
                </p>
                {r.total_ars > 0 && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {formatARS(r.total_ars)}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl px-6 py-4">
              <p className="text-xs text-[var(--muted)] uppercase">Total USD</p>
              <p className="text-2xl font-bold text-[var(--green)]">
                {formatUSD(grandTotalUSD)}
              </p>
            </div>
            {grandTotalARS > 0 && (
              <div className="bg-[var(--green)]/10 border border-[var(--green)]/20 rounded-xl px-6 py-4">
                <p className="text-xs text-[var(--muted)] uppercase">
                  Total ARS
                </p>
                <p className="text-2xl font-bold text-[var(--green)]">
                  {formatARS(grandTotalARS)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ GASTOS POR CATEGORIA ══════════════ */}
      {byCat.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">
            Gastos por Categoria
          </h2>
          <div className="space-y-2">
            {byCat.map(([cat, monto]) => {
              const pct =
                totalGastosOp > 0
                  ? ((monto / totalGastosOp) * 100).toFixed(0)
                  : "0";
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/80">{cat}</span>
                    <span className="font-medium text-[var(--red)]">
                      {formatUSD(monto)}{" "}
                      <span className="text-[var(--muted)] text-xs">
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5">
                    <div
                      className="h-full bg-[var(--red)] rounded-full"
                      style={{
                        width: `${totalGastosOp > 0 ? (monto / totalGastosOp) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════ INGRESOS TABLE ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-base font-semibold text-white">
            Ingresos del Mes ({monthIngresos.length})
          </h2>
          <div className="text-sm text-[var(--muted)]">
            Total: <span className="text-[var(--green)] font-semibold">{formatUSD(totalIngresosMes.usd)}</span>
            {totalIngresosMes.ars > 0 && <span className="ml-2 text-white">+ {formatARS(totalIngresosMes.ars)}</span>}
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-[var(--card-border)] flex flex-wrap gap-3 items-center bg-white/5">
          <input
            type="text"
            placeholder="🔍 Buscar lead / receptor..."
            value={ingresoSearch}
            onChange={(e) => setIngresoSearch(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-xs text-white min-w-[200px]"
          />
          <select value={ingresoMetodo} onChange={(e) => setIngresoMetodo(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos los métodos</option>
            <option value="mercado_pago">Mercado Pago</option>
            <option value="transferencia">Transferencia</option>
            <option value="cash">Cash</option>
            <option value="binance">Binance</option>
            <option value="stripe">Stripe</option>
            <option value="wise">Wise</option>
          </select>
          <select value={ingresoReceptor} onChange={(e) => setIngresoReceptor(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos los receptores</option>
            {RECEPTOR_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
          {(ingresoSearch || ingresoMetodo !== "todos" || ingresoReceptor !== "todos") && (
            <button
              onClick={() => { setIngresoSearch(""); setIngresoMetodo("todos"); setIngresoReceptor("todos"); }}
              className="text-xs text-[var(--muted)] hover:text-white underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {monthIngresos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left text-xs text-[var(--muted)] uppercase">
                  <th className="text-left py-3 px-3">Fecha</th>
                  <th className="text-left py-3 px-3">Lead</th>
                  <th className="text-center py-3 px-3">Cuota</th>
                  <th className="text-left py-3 px-3">Método</th>
                  <th className="text-left py-3 px-3">Recibió</th>
                  <th className="text-right py-3 px-3">USD</th>
                  <th className="text-right py-3 px-3">ARS</th>
                  <th className="text-right py-3 px-3 w-16">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {monthIngresos.map((i) => (
                  <tr key={i.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5 transition-colors">
                    {/* Fecha editable */}
                    <td className="py-2 px-3">
                      <input
                        type="date"
                        defaultValue={i.fecha_pago?.split("T")[0] || ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v && v !== i.fecha_pago?.split("T")[0]) updatePaymentField(i.id, "fecha_pago", v);
                        }}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none"
                      />
                    </td>
                    {/* Lead (read-only) */}
                    <td className="py-2 px-3 text-white font-medium">
                      {i.lead_nombre || "—"}
                      <button
                        type="button"
                        onClick={() => updatePaymentField(i.id, "es_renovacion", i.es_renovacion ? null : true)}
                        className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${i.es_renovacion ? "bg-[var(--purple)]/20 text-[var(--purple-light)]" : "bg-white/5 text-[var(--muted)] hover:bg-[var(--purple)]/10"}`}
                        title={i.es_renovacion ? "Quitar renov" : "Marcar como renov"}
                      >
                        {i.es_renovacion ? "RENOV" : "+ renov"}
                      </button>
                    </td>
                    {/* Cuota editable */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="number"
                        min={1}
                        defaultValue={i.numero_cuota}
                        onBlur={(e) => {
                          const v = parseInt(e.target.value);
                          if (Number.isFinite(v) && v !== i.numero_cuota) updatePaymentField(i.id, "numero_cuota", v);
                        }}
                        className="w-12 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-1 py-1 text-xs text-center text-[var(--muted)] focus:text-white focus:outline-none"
                      />
                    </td>
                    {/* Método editable */}
                    <td className="py-2 px-3">
                      <select
                        defaultValue={i.metodo_pago || ""}
                        onChange={(e) => updatePaymentField(i.id, "metodo_pago", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none"
                      >
                        <option value="">—</option>
                        <option value="mercado_pago">Mercado Pago</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="cash">Cash</option>
                        <option value="binance">Binance</option>
                        <option value="stripe">Stripe</option>
                        <option value="wise">Wise</option>
                      </select>
                    </td>
                    {/* Receptor editable */}
                    <td className="py-2 px-3">
                      <select
                        defaultValue={i.receptor || ""}
                        onChange={(e) => updatePaymentField(i.id, "receptor", e.target.value || null)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none"
                      >
                        <option value="">—</option>
                        {RECEPTOR_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                        {i.receptor && !RECEPTOR_OPTIONS.includes(i.receptor) && (
                          <option value={i.receptor}>{i.receptor}</option>
                        )}
                      </select>
                    </td>
                    {/* Monto USD editable */}
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step={0.01}
                        defaultValue={i.monto_usd || 0}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (Number.isFinite(v) && v !== i.monto_usd) updatePaymentField(i.id, "monto_usd", v);
                        }}
                        className="w-24 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-right font-medium text-[var(--green)] focus:outline-none"
                      />
                    </td>
                    {/* Monto ARS editable */}
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step={0.01}
                        defaultValue={i.monto_ars || 0}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (Number.isFinite(v) && v !== i.monto_ars) updatePaymentField(i.id, "monto_ars", v);
                        }}
                        className="w-24 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-right text-[var(--muted)] focus:text-white focus:outline-none"
                      />
                    </td>
                    {/* Delete */}
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => deletePayment(i.id, i.lead_nombre, i.monto_usd)}
                        className="text-xs text-[var(--red)] hover:underline"
                        title="Borrar pago"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-[var(--muted)] text-sm">Sin ingresos para este periodo</div>
        )}
      </div>

      {/* ══════════════ GASTOS TABLE ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Gastos del Mes ({monthGastos.length})
          </h2>
          <button
            onClick={() => {
              if (showGastoForm) {
                setEditingId(null);
                setGastoForm({
                  fecha: new Date().toISOString().split("T")[0],
                  concepto: "",
                  categoria: "",
                  monto_usd: "",
                  monto_ars: "",
                  billetera: "",
                  pagado_a: "",
                  pagado_por: "",
                  estado: "pagado",
                });
              }
              setShowGastoForm(!showGastoForm);
            }}
            className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm font-medium hover:bg-[var(--purple-light)] transition-colors"
          >
            {showGastoForm ? "Cancelar" : editingId ? "Editando..." : "+ Cargar Gasto"}
          </button>
        </div>

        {/* Inline form */}
        {showGastoForm && (
          <form
            onSubmit={handleSubmitGasto}
            className="px-6 py-4 border-b border-[var(--card-border)] bg-white/5"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input
                type="date"
                value={gastoForm.fecha}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, fecha: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
                required
              />
              <input
                placeholder="Concepto *"
                value={gastoForm.concepto}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, concepto: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
                required
              />
              <input
                placeholder="Categoria"
                value={gastoForm.categoria}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, categoria: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Monto USD"
                type="number"
                step="0.01"
                value={gastoForm.monto_usd}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, monto_usd: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Monto ARS"
                type="number"
                step="0.01"
                value={gastoForm.monto_ars}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, monto_ars: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Billetera"
                value={gastoForm.billetera}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, billetera: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Pagado a"
                value={gastoForm.pagado_a}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, pagado_a: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
              <input
                placeholder="Pagado por"
                value={gastoForm.pagado_por}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, pagado_por: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <select
                value={gastoForm.estado}
                onChange={(e) =>
                  setGastoForm({ ...gastoForm, estado: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm"
              >
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 rounded-lg bg-[var(--green)] text-white text-sm font-medium hover:bg-[var(--green)]/80 transition-colors disabled:opacity-50"
              >
                {submitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="px-6 py-3 border-b border-[var(--card-border)] flex flex-wrap gap-3 items-center bg-white/5">
          <input type="text" placeholder="🔍 Buscar concepto / categoría / pagado a..." value={gastoSearch}
            onChange={(e) => setGastoSearch(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-xs text-white min-w-[260px]" />
          <select value={gastoCategoria} onChange={(e) => setGastoCategoria(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-xs text-white">
            <option value="todos">Todas las categorías</option>
            {gastoCategoriasUnique.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <select value={gastoEstado} onChange={(e) => setGastoEstado(e.target.value)}
            className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-xs text-white">
            <option value="todos">Todos los estados</option>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
          {(gastoSearch || gastoCategoria !== "todos" || gastoEstado !== "todos") && (
            <button
              onClick={() => { setGastoSearch(""); setGastoCategoria("todos"); setGastoEstado("todos"); }}
              className="text-xs text-[var(--muted)] hover:text-white underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {monthGastos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase border-b border-[var(--card-border)]">
                  <th className="text-left py-3 px-3">Fecha</th>
                  <th className="text-left py-3 px-3">Concepto</th>
                  <th className="text-left py-3 px-3">Categoria</th>
                  <th className="text-left py-3 px-3">Billetera</th>
                  <th className="text-left py-3 px-3">Pagado a</th>
                  <th className="text-left py-3 px-3">Pagado por</th>
                  <th className="text-left py-3 px-3">Estado</th>
                  <th className="text-right py-3 px-3">USD</th>
                  <th className="text-right py-3 px-3">ARS</th>
                  <th className="text-right py-3 px-3 w-16">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {monthGastos.map((g) => (
                  <tr key={g.id} className="border-t border-[var(--card-border)]/30 hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3">
                      <input type="date" defaultValue={g.fecha || ""}
                        onBlur={(e) => { if (e.target.value !== g.fecha) updateGastoField(g.id, "fecha", e.target.value); }}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" defaultValue={g.concepto || ""}
                        onBlur={(e) => { if (e.target.value !== g.concepto) updateGastoField(g.id, "concepto", e.target.value); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-white font-medium focus:outline-none" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" defaultValue={g.categoria || ""}
                        onBlur={(e) => { if (e.target.value !== (g.categoria || "")) updateGastoField(g.id, "categoria", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" defaultValue={g.billetera || ""}
                        onBlur={(e) => { if (e.target.value !== (g.billetera || "")) updateGastoField(g.id, "billetera", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" defaultValue={g.pagado_a || ""}
                        onBlur={(e) => { if (e.target.value !== (g.pagado_a || "")) updateGastoField(g.id, "pagado_a", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" defaultValue={g.pagado_por || ""}
                        onBlur={(e) => { if (e.target.value !== (g.pagado_por || "")) updateGastoField(g.id, "pagado_por", e.target.value || null); }}
                        className="w-full bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-2 px-3">
                      <select defaultValue={g.estado || "pagado"}
                        onChange={(e) => updateGastoField(g.id, "estado", e.target.value)}
                        className="bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-[var(--muted)] focus:text-white focus:outline-none">
                        <option value="pagado">Pagado</option>
                        <option value="pendiente">Pendiente</option>
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input type="number" step={0.01} defaultValue={g.monto_usd || 0}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== g.monto_usd) updateGastoField(g.id, "monto_usd", v); }}
                        className="w-24 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-right font-medium text-[var(--red)] focus:outline-none" />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input type="number" step={0.01} defaultValue={g.monto_ars || 0}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== g.monto_ars) updateGastoField(g.id, "monto_ars", v); }}
                        className="w-24 bg-transparent border border-transparent hover:border-[var(--card-border)] focus:border-[var(--purple)] rounded px-2 py-1 text-xs text-right text-[var(--muted)] focus:text-white focus:outline-none" />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => deleteGasto(g.id)}
                          className="text-xs text-[var(--red)] hover:underline"
                          title="Borrar"
                        >
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-[var(--muted)] text-sm">
            Sin gastos para este periodo
          </div>
        )}
      </div>

      {/* ══════════════ MONTHLY CHART ══════════════ */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Ingresos vs Gastos (ultimos 6 meses)
        </h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--card-border)"
            />
            <XAxis
              dataKey="mes"
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v: number) => formatUSD(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                color: "white",
              }}
              formatter={(value) => [formatUSD(Number(value)), ""]}
            />
            <Legend />
            <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProMetricCard({ label, help, color, data }: {
  label: string;
  help: string;
  color: "purple" | "green" | "blue";
  data: { omnipresencia: number; multicuentas: number; consultoria: number; roms_7: number; otros: number; total: number };
}) {
  const colorMap = {
    purple: { text: "text-[var(--purple-light)]", border: "border-[var(--purple)]/40", bg: "bg-[var(--purple)]/10" },
    green: { text: "text-[var(--green)]", border: "border-[var(--green)]/40", bg: "bg-[var(--green)]/10" },
    blue: { text: "text-blue-400", border: "border-blue-400/40", bg: "bg-blue-400/10" },
  };
  const c = colorMap[color];
  return (
    <div className={`bg-[var(--background)] border ${c.border} rounded-xl p-5`}>
      <div className="flex items-start justify-between mb-3">
        <p className={`text-xs uppercase tracking-wide font-semibold ${c.text}`}>{label}</p>
        <span className="relative inline-flex group">
          <span className="cursor-help text-[var(--muted)] hover:text-white text-[10px] border border-[var(--muted)]/50 rounded-full w-4 h-4 inline-flex items-center justify-center leading-none">i</span>
          <span className="invisible group-hover:visible absolute right-0 top-full mt-1 w-72 z-50 bg-[var(--background)] border border-[var(--card-border)] rounded-md p-2 text-[11px] text-white normal-case font-normal shadow-lg whitespace-pre-line">
            {help}
          </span>
        </span>
      </div>
      <p className={`text-3xl font-bold ${c.text}`}>
        ${Math.round(data.total).toLocaleString("en-US")}
      </p>
      <div className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-1 text-xs">
        {data.omnipresencia > 0 && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">Omnipresencia</span><span className={`font-mono ${c.text}`}>${Math.round(data.omnipresencia).toLocaleString("en-US")}</span></div>
        )}
        {data.multicuentas > 0 && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">Multicuentas</span><span className={`font-mono ${c.text}`}>${Math.round(data.multicuentas).toLocaleString("en-US")}</span></div>
        )}
        {data.consultoria > 0 && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">Consultoría</span><span className={`font-mono ${c.text}`}>${Math.round(data.consultoria).toLocaleString("en-US")}</span></div>
        )}
        {data.roms_7 > 0 && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">ROMS 7</span><span className={`font-mono ${c.text}`}>${Math.round(data.roms_7).toLocaleString("en-US")}</span></div>
        )}
        {data.otros > 0 && (
          <div className="flex justify-between"><span className="text-[var(--muted)]">Otros</span><span className={`font-mono ${c.text}`}>${Math.round(data.otros).toLocaleString("en-US")}</span></div>
        )}
        {data.total === 0 && (
          <p className="text-[var(--muted)] text-center py-2">Sin datos</p>
        )}
      </div>
    </div>
  );
}
