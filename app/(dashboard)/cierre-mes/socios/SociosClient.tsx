"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatUSD } from "@/lib/format";
import { getFiscalMonthOptions } from "@/lib/date-utils";

interface Payment {
  id: string;
  lead_id: string | null;
  monto_usd: number | null;
  monto_ars: number | null;
  receptor: string | null;
  fecha_pago: string | null;
  estado: string;
  numero_cuota: number;
  es_renovacion: boolean | null;
}
interface Gasto {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string | null;
  monto_usd: number | null;
  monto_ars: number | null;
  pagado_por: string | null;
  pagado_a: string | null;
  estado: string;
}
interface TeamCommission {
  id: string;
  nombre: string;
  comision_closer: number;
  comision_setter: number;
  comision_total: number;
}
interface Refund {
  monto_usd: number | null;
  monto_ars: number | null;
  receptor: string | null;
  fecha_pago: string | null;
}

interface Props {
  mes: string;
  mesLabel: string;
  payments: Payment[];
  refunds: Refund[];
  gastos: Gasto[];
  teamCommissions: TeamCommission[];
  totalComisionesReal?: number;
}

const SOCIOS = ["Juanma", "Fran"] as const;
type Socio = (typeof SOCIOS)[number];

/** Normaliza el receptor crudo a Juanma / Fran / "otros". */
function normReceptor(r: string | null): Socio | "otros" | null {
  if (!r) return null;
  const n = r.toLowerCase().trim();
  if (n.includes("juanma") || n.includes("juanbma") || n.includes("amigo de juanma") || n === "jm") return "Juanma";
  if (n.includes("fran")) return "Fran";
  return "otros";
}

/** Normaliza el pagador del gasto. */
function normPagador(r: string | null): Socio | "otros" | null {
  if (!r) return null;
  const n = r.toLowerCase().trim();
  if (n.includes("juanma")) return "Juanma";
  if (n.includes("fran")) return "Fran";
  return "otros";
}

export default function SociosClient({ mes, mesLabel, payments, refunds, gastos, teamCommissions, totalComisionesReal }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const monthOptions = useMemo(() => getFiscalMonthOptions(12), []);

  const data = useMemo(() => {
    // Cash por socio (USD)
    const cashPorSocio: Record<Socio | "otros" | "nulo", number> = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
    const cashPorSocioARS: Record<Socio | "otros" | "nulo", number> = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };

    for (const p of payments) {
      const key = normReceptor(p.receptor) || "nulo";
      cashPorSocio[key] += Number(p.monto_usd || 0);
      cashPorSocioARS[key] += Number(p.monto_ars || 0);
    }

    // Refunds descuentan
    for (const r of refunds) {
      const key = normReceptor(r.receptor) || "nulo";
      cashPorSocio[key] -= Number(r.monto_usd || 0);
      cashPorSocioARS[key] -= Number(r.monto_ars || 0);
    }

    // Clasificar gastos en 2 buckets: "sueldos al equipo" vs "operativos"
    type PagoEquipo = { nombre: string; monto: number; concepto: string; fecha: string; pagado_por_socio: Socio | "otros" | "nulo" };
    const pagosAlEquipo: PagoEquipo[] = [];
    const gastosOperativos: Gasto[] = [];
    const reSueldo = /(sueldo|salario|fijo|pago.*(mel|melanie|valen|igna|guille|agus|juan|fran|nacho|seba|nico|hugo|turco))/i;

    for (const g of gastos) {
      const cat = (g.categoria || "").toLowerCase();
      const concepto = (g.concepto || "").toLowerCase();
      const pagadoA = (g.pagado_a || "").trim();
      const esEquipo =
        cat.includes("comisi") || cat.includes("sueldo") || cat.includes("salar") ||
        reSueldo.test(concepto);

      if (esEquipo) {
        let nombre = pagadoA;
        if (!nombre) {
          const m = concepto.match(/(mel(?:anie)?|valen(?:tino)?|igna|guille|agus(?:t[ií]n)?|juan(?:ma)?|fran|nacho|seba|nico(?:l[áa]s)?|hugo|turco)/i);
          if (m) nombre = m[1];
        }
        nombre = nombre ? nombre[0].toUpperCase() + nombre.slice(1).toLowerCase() : "Sin atribuir";
        if (/^mel/i.test(nombre)) nombre = "Mel";
        pagosAlEquipo.push({
          nombre,
          monto: Number(g.monto_usd || 0),
          concepto: g.concepto || "",
          fecha: g.fecha,
          pagado_por_socio: normPagador(g.pagado_por) || "nulo",
        });
      } else {
        gastosOperativos.push(g);
      }
    }

    // Gastos OPERATIVOS por socio (excluye sueldos)
    const gastosOpPorSocio: Record<Socio | "otros" | "nulo", number> = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
    const gastosOpDetalle: Record<Socio | "otros" | "nulo", Gasto[]> = { Juanma: [], Fran: [], otros: [], nulo: [] };
    for (const g of gastosOperativos) {
      const key = normPagador(g.pagado_por) || "nulo";
      gastosOpPorSocio[key] += Number(g.monto_usd || 0);
      gastosOpDetalle[key].push(g);
    }

    // Sueldos pagados por socio (los que YA se pagaron y están en gastos)
    const sueldosPorSocio: Record<Socio | "otros" | "nulo", number> = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
    for (const p of pagosAlEquipo) {
      sueldosPorSocio[p.pagado_por_socio] += p.monto;
    }

    // Gastos TOTALES (operativos + sueldos) por socio — para mantener compatibilidad con el split
    const gastosPorSocio: Record<Socio | "otros" | "nulo", number> = {
      Juanma: gastosOpPorSocio.Juanma + sueldosPorSocio.Juanma,
      Fran: gastosOpPorSocio.Fran + sueldosPorSocio.Fran,
      otros: gastosOpPorSocio.otros + sueldosPorSocio.otros,
      nulo: gastosOpPorSocio.nulo + sueldosPorSocio.nulo,
    };
    const gastosDetalle: Record<Socio | "otros" | "nulo", Gasto[]> = gastosOpDetalle;

    const pagosEquipoPorNombre = new Map<string, number>();
    for (const p of pagosAlEquipo) {
      pagosEquipoPorNombre.set(p.nombre, (pagosEquipoPorNombre.get(p.nombre) || 0) + p.monto);
    }

    const totalCash = cashPorSocio.Juanma + cashPorSocio.Fran + cashPorSocio.otros + cashPorSocio.nulo;
    const totalGastosOp = gastosOpPorSocio.Juanma + gastosOpPorSocio.Fran + gastosOpPorSocio.otros + gastosOpPorSocio.nulo;
    const totalSueldosPagados = sueldosPorSocio.Juanma + sueldosPorSocio.Fran + sueldosPorSocio.otros + sueldosPorSocio.nulo;
    const totalGastos = totalGastosOp + totalSueldosPagados;
    // Si viene `totalComisionesReal` (calculado con tier multiplier en /comisiones)
    // lo usamos. Sino, fallback al cálculo simplificado de teamCommissions.
    const totalComisiones = typeof totalComisionesReal === "number" && totalComisionesReal > 0
      ? totalComisionesReal
      : teamCommissions.reduce((s, c) => s + c.comision_total, 0);

    // Detectar el sueldo de Mel (fijo, va aparte del bloque "Comisiones" en el mensaje)
    const sueldoMel = pagosAlEquipo.filter((p) => p.nombre === "Mel").reduce((s, p) => s + p.monto, 0);
    // Comisiones consolidadas = pagadas (sin Mel) + por pagar (Valen scheme)
    const sueldosPagadosSinMel = totalSueldosPagados - sueldoMel;
    const comisionesTotales = sueldosPagadosSinMel + totalComisiones;

    // Pool a repartir 50/50 = cash − gastos − comisiones
    const poolNeto = totalCash - totalGastos - totalComisiones;
    const tocaCadaUno = poolNeto / 2;

    // Lo que YA tiene cada socio en su bolsillo (cash que cobró − gastos que pagó − su parte de comisiones a pagar)
    const comisionesPorSocio = totalComisiones / 2;
    const tieneJuanma = cashPorSocio.Juanma - gastosPorSocio.Juanma - comisionesPorSocio;
    const tieneFran = cashPorSocio.Fran - gastosPorSocio.Fran - comisionesPorSocio;

    // Diferencias con respecto a lo que debería tener cada uno
    const difJuanma = tieneJuanma - tocaCadaUno;
    const difFran = tieneFran - tocaCadaUno;

    // El de mayor diff le pasa al de menor diff para igualar
    let transferDe: Socio | null = null;
    let transferA: Socio | null = null;
    let transferMonto = 0;
    if (Math.abs(difJuanma - difFran) > 0.5) {
      if (difJuanma > difFran) {
        transferDe = "Juanma";
        transferA = "Fran";
        transferMonto = (difJuanma - difFran) / 2;
      } else {
        transferDe = "Fran";
        transferA = "Juanma";
        transferMonto = (difFran - difJuanma) / 2;
      }
    }

    return {
      cashPorSocio,
      cashPorSocioARS,
      gastosPorSocio,
      gastosDetalle,
      gastosOpPorSocio,
      gastosOpDetalle,
      sueldosPorSocio,
      totalGastosOp,
      totalSueldosPagados,
      totalCash,
      totalGastos,
      totalComisiones,
      sueldoMel,
      comisionesTotales,
      poolNeto,
      tocaCadaUno,
      tieneJuanma,
      tieneFran,
      transferDe,
      transferA,
      transferMonto,
      pagosAlEquipo,
      pagosEquipoPorNombre,
    };
  }, [payments, refunds, gastos, teamCommissions, totalComisionesReal]);

  function handleMesChange(value: string) {
    const url = `/cierre-mes/socios?mes=${value}`;
    router.push(url);
  }

  function buildWhatsAppMessage() {
    // Formato simple sin "$" para que matche la estructura pedida.
    const f = (n: number) => Math.round(n).toLocaleString("en-US");
    const fDec = (n: number) =>
      n.toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

    // Cash atribuido a Juanma incluye lo cobrado bajo su nombre + "otros" (Valen/Mati)
    // y "sin receptor" — porque la plata cae en su cuenta antes de cualquier reparto.
    const cashJuanmaTotal = data.cashPorSocio.Juanma + data.cashPorSocio.otros + data.cashPorSocio.nulo;
    const cashFranTotal = data.cashPorSocio.Fran;
    const cashOtrosNote = data.cashPorSocio.otros + data.cashPorSocio.nulo;

    // Totales de gastos por socio (operativos)
    const gastosJuanmaOp = data.gastosOpPorSocio.Juanma;
    const gastosFranOp = data.gastosOpPorSocio.Fran;

    // Comisiones (pagadas + a pagar) van en bloque Juanma; Mel aparte
    const comisiones = data.comisionesTotales;
    const mel = data.sueldoMel;
    const totalGastosJuanma = gastosJuanmaOp + comisiones + mel;

    // Saldos
    const saldoJuanma = cashJuanmaTotal - totalGastosJuanma;
    const saldoFran = cashFranTotal - gastosFranOp;
    const utilidad = saldoJuanma + saldoFran;
    const cuota = utilidad / 2;
    const diff = saldoJuanma - cuota; // positivo = Juanma le pasa a Fran

    const lines: string[] = [
      `Gastos Juanma:`,
      `$${f(gastosJuanmaOp)} USD`,
      `$${f(comisiones)} Comisiones (pagadas + a pagar)`,
      `$${f(mel)} Sueldo Mel`,
      ``,
      `Total: $${f(totalGastosJuanma)} USD`,
      ``,
      `Gastos Fran:`,
      `$${f(gastosFranOp)} USD`,
      ``,
      `Ingreso:`,
      `CC ${mesLabel}: $${f(data.totalCash)} USD`,
      ``,
      cashOtrosNote > 0
        ? `Juanma: $${f(cashJuanmaTotal)} USD (incluye $${f(cashOtrosNote)} Valen/JuanMa)`
        : `Juanma: $${f(cashJuanmaTotal)} USD`,
      `Fran: $${f(cashFranTotal)} USD`,
      ``,
      ``,
      `Saldo Juanma:`,
      `$${f(cashJuanmaTotal)} − $${f(totalGastosJuanma)} = $${f(saldoJuanma)} USD`,
      ``,
      `Saldo Fran:`,
      `$${f(cashFranTotal)} − $${f(gastosFranOp)} = ${saldoFran < 0 ? "−$" + f(Math.abs(saldoFran)) : "$" + f(saldoFran)} USD`,
      ``,
      `Utilidad neta:`,
      `$${f(utilidad)} USD`,
      ``,
      `Cuota cada uno (50/50):`,
      `$${fDec(cuota)} USD`,
      ``,
      ``,
      diff > 0.5
        ? `👉 Juanma le pasa a Fran: $${f(diff)} USD`
        : diff < -0.5
        ? `👉 Fran le pasa a Juanma: $${f(Math.abs(diff))} USD`
        : `✅ Ya están iguales.`,
      ``,
      `Quedan:`,
      `$${fDec(cuota)} USD cada uno`,
    ];

    return lines.join("\n");
  }

  async function copyMsg() {
    const msg = buildWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copiá esto:", msg);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🤝 Cierre Mes — Socios (Juanma / Fran)</h1>
          <p className="text-sm text-[var(--muted)]">Split 50/50 con cash, gastos, comisiones y transferencia entre socios.</p>
        </div>
        <div className="flex gap-2">
          <select
            value={mes}
            onChange={(e) => handleMesChange(e.target.value)}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)]"
          >
            {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <Link href="/cierre-mes" className="px-3 py-2 text-sm rounded-lg border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Cierre Mes general
          </Link>
        </div>
      </div>

      {/* KPIs grandes */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Cash mes" value={data.totalCash} color="text-green-400" />
        <KPI label="Gastos operativos" value={data.totalGastosOp} color="text-red-400" />
        <KPI label="Sueldos pagados" value={data.totalSueldosPagados} color="text-orange-400" />
        <KPI label="Comisiones a pagar" value={data.totalComisiones} color="text-amber-400" />
        <KPI label="Pool neto (50/50)" value={data.poolNeto} color="text-[var(--purple)]" />
      </div>

      {/* Por socio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SocioCard
          nombre="Juanma"
          cash={data.cashPorSocio.Juanma}
          gastosOp={data.gastosOpPorSocio.Juanma}
          sueldos={data.sueldosPorSocio.Juanma}
          tiene={data.tieneJuanma}
          toca={data.tocaCadaUno}
        />
        <SocioCard
          nombre="Fran"
          cash={data.cashPorSocio.Fran}
          gastosOp={data.gastosOpPorSocio.Fran}
          sueldos={data.sueldosPorSocio.Fran}
          tiene={data.tieneFran}
          toca={data.tocaCadaUno}
        />
      </div>

      {/* Transferencia */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[var(--muted)] mb-2">💸 Transferencia para igualar</h2>
        {data.transferDe && data.transferA ? (
          <div className="space-y-2">
            <p className="text-2xl font-bold">
              {data.transferDe} le pasa <span className="text-[var(--purple)]">{formatUSD(Math.round(data.transferMonto))}</span> a {data.transferA}
            </p>
            <p className="text-xs text-[var(--muted)]">Después de la transferencia, ambos quedan con {formatUSD(Math.round(data.tocaCadaUno))}.</p>
          </div>
        ) : (
          <p className="text-lg text-green-400">✅ Ya están iguales. No hay que transferir nada.</p>
        )}
        <button
          onClick={copyMsg}
          className="mt-4 px-4 py-2 text-sm rounded-lg bg-[var(--purple)]/20 border border-[var(--purple)]/40 text-[var(--purple)] hover:bg-[var(--purple)]/30"
        >
          {copied ? "✓ Copiado" : "📋 Copiar mensaje para WhatsApp"}
        </button>
      </div>

      {/* Cash "Otros" / sin receptor: aviso */}
      {(data.cashPorSocio.otros > 0 || data.cashPorSocio.nulo > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm">
          <p className="font-semibold mb-1 text-amber-300">⚠ Pagos sin atribución a socio</p>
          <p className="text-[var(--muted)]">
            {data.cashPorSocio.otros > 0 && <>Otros receptores (Valen/Mati/etc): <span className="font-mono">{formatUSD(Math.round(data.cashPorSocio.otros))}</span>. </>}
            {data.cashPorSocio.nulo > 0 && <>Sin receptor cargado: <span className="font-mono">{formatUSD(Math.round(data.cashPorSocio.nulo))}</span>. </>}
            Estos montos entran al pool 50/50 igual (cualquier socio se los puede tener que repartir).
          </p>
        </div>
      )}

      {/* Pagos al equipo (visible siempre, no colapsado) */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3">💼 Pagos al equipo del mes</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Comisiones a pagar */}
          <div>
            <h3 className="text-xs uppercase text-[var(--muted)] mb-2">Comisiones a pagar ({teamCommissions.length})</h3>
            {teamCommissions.length === 0 ? (
              <p className="text-xs text-[var(--muted)] italic">Sin comisiones este mes</p>
            ) : (
              <div className="space-y-1 text-sm">
                {[...teamCommissions].sort((a, b) => b.comision_total - a.comision_total).map((c) => (
                  <div key={c.id} className="flex justify-between border-b border-[var(--card-border)] py-1.5">
                    <span>{c.nombre}</span>
                    <span className="font-mono">{formatUSD(Math.round(c.comision_total))}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t border-[var(--card-border)] pt-2 mt-2">
                  <span>Total</span>
                  <span className="font-mono text-amber-400">{formatUSD(Math.round(data.totalComisiones))}</span>
                </div>
              </div>
            )}
          </div>

          {/* Sueldos / pagos fijos ya cargados en gastos */}
          <div>
            <h3 className="text-xs uppercase text-[var(--muted)] mb-2">Sueldos / pagos ya cargados ({data.pagosEquipoPorNombre.size})</h3>
            {data.pagosEquipoPorNombre.size === 0 ? (
              <p className="text-xs text-[var(--muted)] italic">Sin sueldos/pagos detectados en gastos</p>
            ) : (
              <div className="space-y-1 text-sm">
                {Array.from(data.pagosEquipoPorNombre.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([nombre, monto]) => (
                    <div key={nombre} className="flex justify-between border-b border-[var(--card-border)] py-1.5">
                      <span>{nombre}</span>
                      <span className="font-mono">{formatUSD(Math.round(monto))}</span>
                    </div>
                  ))}
                <div className="flex justify-between font-semibold border-t border-[var(--card-border)] pt-2 mt-2">
                  <span>Total</span>
                  <span className="font-mono">
                    {formatUSD(Math.round(Array.from(data.pagosEquipoPorNombre.values()).reduce((s, n) => s + n, 0)))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-[10px] text-[var(--muted)] mt-3">
          Las comisiones a pagar se calculan con la fórmula Valen (7/5/7 × multiplicador, cap 10%).
          Los sueldos se detectan en gastos por concepto/categoría/pagado_a (sueldo, salario, comisiones, nombre del miembro).
        </p>
      </div>

      <details className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-semibold">💸 Gastos operativos (detalle — excluye sueldos)</summary>
        <div className="mt-3 space-y-3">
          {SOCIOS.map((s) => (
            <div key={s}>
              <h4 className="text-xs font-semibold text-[var(--muted)] mb-1">Pagados por {s} ({data.gastosOpDetalle[s].length}) — {formatUSD(Math.round(data.gastosOpPorSocio[s]))}</h4>
              {data.gastosOpDetalle[s].length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">Sin gastos operativos</p>
              ) : (
                <ul className="text-xs space-y-1">
                  {data.gastosOpDetalle[s].slice(0, 30).map((g) => (
                    <li key={g.id} className="flex justify-between border-b border-[var(--card-border)] py-1">
                      <span className="truncate flex-1">{g.fecha?.slice(5)} · {g.concepto} {g.categoria && <span className="text-[var(--muted)]">({g.categoria})</span>}</span>
                      <span className="font-mono">{formatUSD(Math.round(g.monto_usd || 0))}</span>
                    </li>
                  ))}
                  {data.gastosOpDetalle[s].length > 30 && (
                    <li className="text-[var(--muted)] italic">+ {data.gastosOpDetalle[s].length - 30} más</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      </details>

      <details className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-semibold">💼 Sueldos al equipo (detalle por persona y socio que pagó)</summary>
        <div className="mt-3 space-y-3">
          {data.pagosAlEquipo.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sin sueldos cargados este mes en gastos.</p>
          ) : (
            <>
              {/* Agrupado por persona */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--muted)] mb-1">Por persona</h4>
                <ul className="text-xs space-y-1">
                  {Array.from(data.pagosEquipoPorNombre.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([nombre, monto]) => {
                      const items = data.pagosAlEquipo.filter((p) => p.nombre === nombre);
                      return (
                        <li key={nombre} className="border-b border-[var(--card-border)] py-1.5">
                          <div className="flex justify-between">
                            <span className="font-semibold">{nombre}</span>
                            <span className="font-mono">{formatUSD(Math.round(monto))}</span>
                          </div>
                          <ul className="ml-3 mt-1 space-y-0.5 text-[var(--muted)]">
                            {items.map((p, i) => (
                              <li key={i} className="flex justify-between">
                                <span>{p.fecha.slice(5)} · {p.concepto} <span className="opacity-60">({p.pagado_por_socio === "nulo" ? "?" : p.pagado_por_socio})</span></span>
                                <span className="font-mono">{formatUSD(Math.round(p.monto))}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                </ul>
              </div>

              {/* Quién pagó cada sueldo */}
              <div>
                <h4 className="text-xs font-semibold text-[var(--muted)] mb-1">Por socio que pagó</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {SOCIOS.map((s) => (
                    <div key={s} className="bg-[#0d0d0f] rounded p-2">
                      <p className="font-semibold mb-1">{s}: {formatUSD(Math.round(data.sueldosPorSocio[s]))}</p>
                      <ul className="space-y-0.5 text-[var(--muted)]">
                        {data.pagosAlEquipo.filter((p) => p.pagado_por_socio === s).map((p, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{p.nombre} ({p.fecha.slice(5)})</span>
                            <span className="font-mono">{formatUSD(Math.round(p.monto))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color || "text-white"}`}>{formatUSD(Math.round(value))}</p>
    </div>
  );
}

function SocioCard({ nombre, cash, gastosOp, sueldos, tiene, toca }: { nombre: string; cash: number; gastosOp: number; sueldos: number; tiene: number; toca: number }) {
  const dif = tiene - toca;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <h3 className="text-lg font-bold mb-3">{nombre}</h3>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-[var(--muted)]">Cash cobrado</span><span className="font-mono text-green-400">{formatUSD(Math.round(cash))}</span></div>
        <div className="flex justify-between"><span className="text-[var(--muted)]">Gastos operativos</span><span className="font-mono text-red-400">−{formatUSD(Math.round(gastosOp))}</span></div>
        <div className="flex justify-between"><span className="text-[var(--muted)]">Sueldos pagados</span><span className="font-mono text-orange-400">−{formatUSD(Math.round(sueldos))}</span></div>
        <div className="flex justify-between border-t border-[var(--card-border)] pt-2 mt-2 font-semibold"><span>Tiene</span><span className="font-mono">{formatUSD(Math.round(tiene))}</span></div>
        <div className="flex justify-between text-xs text-[var(--muted)]"><span>Debería tener</span><span className="font-mono">{formatUSD(Math.round(toca))}</span></div>
        <div className="flex justify-between text-xs pt-1">
          <span className="text-[var(--muted)]">Diferencia</span>
          <span className={`font-mono font-semibold ${Math.abs(dif) < 1 ? "text-[var(--muted)]" : dif > 0 ? "text-green-400" : "text-amber-400"}`}>
            {dif > 0 ? "+" : ""}{formatUSD(Math.round(dif))}
          </span>
        </div>
      </div>
    </div>
  );
}
