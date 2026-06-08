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

export default function SociosClient({ mes, mesLabel, payments, refunds, gastos, teamCommissions }: Props) {
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

    // Gastos por socio (USD)
    const gastosPorSocio: Record<Socio | "otros" | "nulo", number> = { Juanma: 0, Fran: 0, otros: 0, nulo: 0 };
    const gastosDetalle: Record<Socio | "otros" | "nulo", Gasto[]> = { Juanma: [], Fran: [], otros: [], nulo: [] };
    for (const g of gastos) {
      const key = normPagador(g.pagado_por) || "nulo";
      gastosPorSocio[key] += Number(g.monto_usd || 0);
      gastosDetalle[key].push(g);
    }

    const totalCash = cashPorSocio.Juanma + cashPorSocio.Fran + cashPorSocio.otros + cashPorSocio.nulo;
    const totalGastos = gastosPorSocio.Juanma + gastosPorSocio.Fran + gastosPorSocio.otros + gastosPorSocio.nulo;
    const totalComisiones = teamCommissions.reduce((s, c) => s + c.comision_total, 0);

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
      totalCash,
      totalGastos,
      totalComisiones,
      poolNeto,
      tocaCadaUno,
      tieneJuanma,
      tieneFran,
      transferDe,
      transferA,
      transferMonto,
    };
  }, [payments, refunds, gastos, teamCommissions]);

  function handleMesChange(value: string) {
    const url = `/cierre-mes/socios?mes=${value}`;
    router.push(url);
  }

  function buildWhatsAppMessage() {
    const f = (n: number) => formatUSD(Math.round(n));
    const lines = [
      `*🤝 Split Socios — ${mesLabel}*`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "*Cash cobrado*",
      `• Juanma: ${f(data.cashPorSocio.Juanma)}`,
      `• Fran: ${f(data.cashPorSocio.Fran)}`,
      data.cashPorSocio.otros > 0 ? `• Otros (Valen/Mati/etc): ${f(data.cashPorSocio.otros)}` : "",
      data.cashPorSocio.nulo > 0 ? `• Sin receptor: ${f(data.cashPorSocio.nulo)}` : "",
      `*Total cash:* ${f(data.totalCash)}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "*Gastos pagados*",
      `• Juanma: ${f(data.gastosPorSocio.Juanma)}`,
      `• Fran: ${f(data.gastosPorSocio.Fran)}`,
      data.gastosPorSocio.otros > 0 ? `• Otros: ${f(data.gastosPorSocio.otros)}` : "",
      `*Total gastos:* ${f(data.totalGastos)}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      `*Comisiones a pagar al equipo:* ${f(data.totalComisiones)}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      `*Pool neto a repartir (50/50):* ${f(data.poolNeto)}`,
      `*Le toca a cada uno:* ${f(data.tocaCadaUno)}`,
      "",
      `📦 *Juanma tiene:* ${f(data.tieneJuanma)}`,
      `📦 *Fran tiene:* ${f(data.tieneFran)}`,
      "",
      data.transferDe && data.transferA
        ? `💸 *${data.transferDe} le pasa ${f(data.transferMonto)} a ${data.transferA}* para igualar.`
        : "✅ Ya están iguales — no hay que pasarse nada.",
    ].filter(Boolean);
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Cash mes" value={data.totalCash} color="text-green-400" />
        <KPI label="Gastos mes" value={data.totalGastos} color="text-red-400" />
        <KPI label="Comisiones a pagar" value={data.totalComisiones} color="text-amber-400" />
        <KPI label="Pool neto (50/50)" value={data.poolNeto} color="text-[var(--purple)]" />
      </div>

      {/* Por socio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SocioCard
          nombre="Juanma"
          cash={data.cashPorSocio.Juanma}
          gastos={data.gastosPorSocio.Juanma}
          tiene={data.tieneJuanma}
          toca={data.tocaCadaUno}
        />
        <SocioCard
          nombre="Fran"
          cash={data.cashPorSocio.Fran}
          gastos={data.gastosPorSocio.Fran}
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

      {/* Detalles colapsables */}
      <details className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-semibold">Comisiones del mes ({teamCommissions.length} personas)</summary>
        <div className="mt-3 space-y-1 text-sm">
          {teamCommissions.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sin comisiones cargadas este mes</p>
          ) : (
            teamCommissions.map((c) => (
              <div key={c.id} className="flex justify-between border-b border-[var(--card-border)] py-1.5">
                <span>{c.nombre}</span>
                <span className="font-mono text-[var(--muted)]">{formatUSD(Math.round(c.comision_total))}</span>
              </div>
            ))
          )}
        </div>
      </details>

      <details className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-semibold">Gastos del mes (detalle)</summary>
        <div className="mt-3 space-y-3">
          {SOCIOS.map((s) => (
            <div key={s}>
              <h4 className="text-xs font-semibold text-[var(--muted)] mb-1">Pagados por {s} ({data.gastosDetalle[s].length})</h4>
              {data.gastosDetalle[s].length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">Sin gastos</p>
              ) : (
                <ul className="text-xs space-y-1">
                  {data.gastosDetalle[s].slice(0, 30).map((g) => (
                    <li key={g.id} className="flex justify-between border-b border-[var(--card-border)] py-1">
                      <span className="truncate flex-1">{g.fecha?.slice(5)} · {g.concepto} {g.categoria && <span className="text-[var(--muted)]">({g.categoria})</span>}</span>
                      <span className="font-mono">{formatUSD(Math.round(g.monto_usd || 0))}</span>
                    </li>
                  ))}
                  {data.gastosDetalle[s].length > 30 && (
                    <li className="text-[var(--muted)] italic">+ {data.gastosDetalle[s].length - 30} más</li>
                  )}
                </ul>
              )}
            </div>
          ))}
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

function SocioCard({ nombre, cash, gastos, tiene, toca }: { nombre: string; cash: number; gastos: number; tiene: number; toca: number }) {
  const dif = tiene - toca;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <h3 className="text-lg font-bold mb-3">{nombre}</h3>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-[var(--muted)]">Cash cobrado</span><span className="font-mono text-green-400">{formatUSD(Math.round(cash))}</span></div>
        <div className="flex justify-between"><span className="text-[var(--muted)]">Gastos pagados</span><span className="font-mono text-red-400">−{formatUSD(Math.round(gastos))}</span></div>
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
