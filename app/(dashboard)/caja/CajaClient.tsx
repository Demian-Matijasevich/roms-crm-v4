"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUSD } from "@/lib/format";
import {
  getFiscalMonth,
  parseLocalDate,
  toDateString,
  getFiscalStart,
  getFiscalEnd,
} from "@/lib/date-utils";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { useToast } from "@/app/components/Toast";

// ---------- Types ----------
interface Payment {
  id: string;
  lead_id: string | null;
  fecha_pago: string;
  monto_usd: number | null;
  monto_ars: number | null;
  receptor: string | null;
  estado: "pagado" | "refund" | string;
  es_renovacion: boolean | null;
}

interface Gasto {
  id: string;
  fecha: string;
  concepto: string | null;
  categoria: string | null;
  monto_usd: number | null;
  monto_ars: number | null;
  billetera: string | null;
  pagado_a: string | null;
  pagado_por: string | null;
  estado: string | null;
  usd_rate_aplicado: number | null;
  nicho: string | null;
  devengado_mes: string | null;
}

interface UsdRateRow {
  mes: string;
  rate: number;
}

interface TeamMember {
  id: string;
  nombre: string;
}

interface Props {
  initialMonth: string;
  initialModo: "mes" | "acum";
  histStart: string;
  payments: Payment[];
  gastos: Gasto[];
  monthlyRates: UsdRateRow[];
  team: TeamMember[];
  usdRateGlobal: number;
  paymentsTruncated?: boolean;
  gastosTruncated?: boolean;
  paymentsCount?: number | null;
  gastosCount?: number | null;
}

type SocioName = "Juanma" | "Fran" | "otros" | "nulo";

// ---------- Pure helpers ----------

function normSocio(raw: string | null | undefined): SocioName {
  if (!raw) return "nulo";
  const s = String(raw).toLowerCase().trim();
  if (!s) return "nulo";
  // Split en palabras exactas (word-tokens). Evita que "franco/francisca/francia"
  // matcheen a "fran" por substring, y que "franciscanas" matchee a "francisco".
  const words = s.split(/[\s,._\-\/@]+/).filter(Boolean);
  const wordSet = new Set(words);

  // --- Juanma ---
  // Aliases word-exact: "juanma", "juanbma", "jm".
  if (wordSet.has("juanma") || wordSet.has("juanbma") || wordSet.has("jm")) {
    return "Juanma";
  }
  // Nombre completo: "Juan Martin Wohl (Larrañaga)". Requiere las 3 palabras.
  // "Juan" solo NO alcanza (podría ser cualquier Juan).
  if (wordSet.has("juan") && wordSet.has("martin") && wordSet.has("wohl")) {
    return "Juanma";
  }

  // --- Fran ---
  // Alias word-exact: "fran". Nombre completo: "Francisco Castro" requiere ambas.
  // "Francisco" solo NO alcanza (podría ser cualquier Francisco).
  if (wordSet.has("fran")) return "Fran";
  if (wordSet.has("francisco") && wordSet.has("castro")) return "Fran";

  return "otros";
}

const YM_REGEX = /^\d{4}-\d{2}$/;

/**
 * Determina el YYYY-MM al que se DEVENGA el gasto.
 *
 * Fuente de verdad: la columna `devengado_mes` (persistida). Antes se parseaba
 * del texto del concepto/pagado_a con regex de meses en español, lo que era
 * vulnerable a que un admin escribiera "enero" o "roms corp" y moviera plata
 * entre buckets sin querer (bug ALTO). Ahora:
 *
 *   - Si la row trae `devengado_mes` válido (YYYY-MM) → se usa tal cual.
 *   - Si es null (row legacy sin backfill, no debería pasar tras la migración
 *     043) → fallback al YYYY-MM de `fecha`.
 *
 * NUNCA se infiere del concepto/notas.
 */
function fechaDevengadaMonth(g: Gasto): string {
  const dm = g.devengado_mes;
  if (dm && YM_REGEX.test(dm)) return dm;
  return (g.fecha || "").slice(0, 7);
}

// Devuelve YYYY-MM-DD en timezone de Sao Paulo (GMT-3, sin DST).
// Evita el bug de que a las 21:xx local UTC "hoy" salte al día siguiente.
function todayInSP(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function isReparto(g: Gasto): boolean {
  const cat = (g.categoria || "").toLowerCase().trim();
  const conc = (g.concepto || "").toLowerCase();
  // Aceptamos ambas variantes por si algun script guardo la version snake_case.
  if (cat === "reparto socios" || cat === "reparto_socios") return true;
  if (conc.includes("transferencia socios")) return true;
  return false;
}

function isDescuentoPersonal(g: Gasto): boolean {
  const cat = (g.categoria || "").toLowerCase().trim();
  if (cat === "personal socio" || cat === "descuento_personal_socio") return true;
  const conc = (g.concepto || "").toLowerCase();
  if (conc.startsWith("descuento personal")) return true;
  return false;
}

interface UsdContext {
  blueRates: Map<string, number>;
  monthlyRates: UsdRateRow[];
  usdRateGlobal: number;
}

function rateForMonth(ym: string, ctx: UsdContext): number {
  const hit = ctx.monthlyRates.find((r) => (r.mes || "").slice(0, 7) === ym);
  if (hit && hit.rate > 0) return hit.rate;
  return ctx.usdRateGlobal;
}

function usdEquivRow(
  row: {
    monto_usd: number | null;
    monto_ars: number | null;
    usd_rate_aplicado?: number | null;
    fecha?: string | null;
    fecha_pago?: string | null;
  },
  ctx: UsdContext,
): number {
  const usd = Number(row.monto_usd || 0);
  if (usd > 0) return usd;
  const ars = Number(row.monto_ars || 0);
  if (ars <= 0) return 0;
  const aplicado = Number(row.usd_rate_aplicado || 0);
  if (aplicado > 0) return ars / aplicado;
  const dateStr = (row.fecha_pago || row.fecha || "").slice(0, 10);
  if (dateStr) {
    const blue = ctx.blueRates.get(dateStr);
    if (blue && blue > 0) return ars / blue;
    const ym = dateStr.slice(0, 7);
    const rate = rateForMonth(ym, ctx);
    if (rate > 0) return ars / rate;
  }
  if (ctx.usdRateGlobal > 0) return ars / ctx.usdRateGlobal;
  return 0;
}

interface CajaSnapshot {
  cashIn: number;
  cashInPorSocio: { Juanma: number; Fran: number; otros: number };
  cashOut: number;
  neto: number;
  caja50: number;
  juanma25: number;
  fran25: number;
  descJuanma: number;
  descFran: number;
  netoTransferJuanma: number;
  netoTransferFran: number;
  balanceJuanma: number;
  balanceFran: number;
  sugerencia: { de: "Juanma" | "Fran"; a: "Juanma" | "Fran"; monto: number } | null;
  gastosOperativos: Array<{ g: Gasto; usd: number; movido: boolean; devengadoYM: string }>;
  transferencias: Array<{ g: Gasto; usd: number; devengadoYM: string }>;
  descuentos: Array<{ g: Gasto; usd: number; socio: SocioName; devengadoYM: string }>;
}

function computeCaja(
  payments: Payment[],
  gastos: Gasto[],
  targetYM: string,
  ctx: UsdContext,
  modo: "mes" | "acum",
  histStart: string,
): CajaSnapshot {
  // --- Cash IN ---
  // NOTA: para refunds asumimos que la row tiene su propio `fecha_pago`
  // = fecha del reembolso (no la del pago original). Bucketeamos por ese mes.
  let cashIn = 0;
  const cashInPorSocio = { Juanma: 0, Fran: 0, otros: 0 };
  for (const p of payments) {
    if (!p.fecha_pago) continue;
    const f = p.fecha_pago.slice(0, 10);
    if (modo === "mes") {
      if (f.slice(0, 7) !== targetYM) continue;
    } else {
      if (f < histStart) continue;
      if (f.slice(0, 7) > targetYM) continue;
    }
    let val = usdEquivRow(p, ctx);
    if (p.estado === "refund") val = -Math.abs(val);
    cashIn += val;
    const soc = normSocio(p.receptor);
    // NO derramamos a Juanma los receptores desconocidos/binance/null.
    // Los mostramos como "sin asignar" — queda a caja empresa, no
    // infla el cash físico atribuible a un socio.
    if (soc === "Fran") cashInPorSocio.Fran += val;
    else if (soc === "Juanma") cashInPorSocio.Juanma += val;
    else cashInPorSocio.otros += val;
  }

  // --- Cash OUT operativo (con devengado en modo mes) ---
  let cashOut = 0;
  const gastosOperativos: CajaSnapshot["gastosOperativos"] = [];
  const transferencias: CajaSnapshot["transferencias"] = [];
  const descuentos: CajaSnapshot["descuentos"] = [];

  for (const g of gastos) {
    const usd = usdEquivRow(g, ctx);
    const fechaYM = (g.fecha || "").slice(0, 7);
    const devengadoYM = modo === "mes" ? fechaDevengadaMonth(g) : fechaYM;

    if (isReparto(g)) {
      if (modo === "mes" ? devengadoYM === targetYM : fechaYM <= targetYM && fechaYM >= histStart.slice(0, 7)) {
        transferencias.push({ g, usd, devengadoYM });
      }
      continue;
    }
    if (isDescuentoPersonal(g)) {
      if (modo === "mes" ? devengadoYM === targetYM : fechaYM <= targetYM && fechaYM >= histStart.slice(0, 7)) {
        const soc = normSocio(g.pagado_por);
        descuentos.push({ g, usd, socio: soc, devengadoYM });
      }
      continue;
    }
    // Operativo
    if (modo === "mes") {
      if (devengadoYM !== targetYM) continue;
      const movido = devengadoYM !== fechaYM;
      gastosOperativos.push({ g, usd, movido, devengadoYM });
      cashOut += usd;
    } else {
      if (fechaYM > targetYM) continue;
      if (fechaYM < histStart.slice(0, 7)) continue;
      gastosOperativos.push({ g, usd, movido: false, devengadoYM: fechaYM });
      cashOut += usd;
    }
  }

  const neto = cashIn - cashOut;
  const caja50 = neto * 0.5;
  const juanma25 = neto * 0.25;
  const fran25 = neto * 0.25;

  let descJuanma = 0;
  let descFran = 0;
  for (const d of descuentos) {
    if (d.socio === "Juanma") descJuanma += d.usd;
    else if (d.socio === "Fran") descFran += d.usd;
  }

  let transferJuanmaAFran = 0;
  let transferFranAJuanma = 0;
  for (const t of transferencias) {
    const de = normSocio(t.g.pagado_por);
    // pagado_a puede tener sufijos, normalizamos
    const a = normSocio(t.g.pagado_a);
    if (de === "Juanma" && a === "Fran") transferJuanmaAFran += t.usd;
    else if (de === "Fran" && a === "Juanma") transferFranAJuanma += t.usd;
  }
  const netoTransferJuanma = transferFranAJuanma - transferJuanmaAFran;
  const netoTransferFran = transferJuanmaAFran - transferFranAJuanma;

  const balanceJuanma = juanma25 - descJuanma + netoTransferJuanma;
  const balanceFran = fran25 - descFran + netoTransferFran;

  let sugerencia: CajaSnapshot["sugerencia"] = null;
  const diff = balanceJuanma - balanceFran;
  if (Math.abs(diff) > 100 && neto > 0) {
    if (diff > 0) sugerencia = { de: "Fran", a: "Juanma", monto: diff / 2 };
    else sugerencia = { de: "Juanma", a: "Fran", monto: Math.abs(diff) / 2 };
  }

  return {
    cashIn,
    cashInPorSocio,
    cashOut,
    neto,
    caja50,
    juanma25,
    fran25,
    descJuanma,
    descFran,
    netoTransferJuanma,
    netoTransferFran,
    balanceJuanma,
    balanceFran,
    sugerencia,
    gastosOperativos,
    transferencias,
    descuentos,
  };
}

// ---------- Component ----------

export default function CajaClient(props: Props) {
  const router = useRouter();
  const toast = useToast();

  const [selectedMonth, setSelectedMonth] = useState(props.initialMonth);
  const [modo, setModo] = useState<"mes" | "acum">(props.initialModo);
  const [blueRates, setBlueRates] = useState<Map<string, number>>(new Map());
  const [modalTransfer, setModalTransfer] = useState(false);
  const [modalDescuento, setModalDescuento] = useState(false);
  const [filtroConcepto, setFiltroConcepto] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [soloMovidos, setSoloMovidos] = useState(false);

  // Sync URL (mes/modo) → dispara refetch server-side.
  // Guardamos el mount inicial: los props ya vienen del server con el mes/modo
  // correctos, no hace falta re-fetchear. Solo refrescamos cuando el user
  // cambia el mes o el modo.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const url = `/caja?mes=${encodeURIComponent(selectedMonth)}&modo=${modo}`;
    router.replace(url);
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, modo]);

  // Blue rates para pagos ARS sin USD.
  const arsDatesNeeded = useMemo(() => {
    const set = new Set<string>();
    for (const p of props.payments) {
      if (!p.fecha_pago) continue;
      const usd = Number(p.monto_usd || 0);
      const ars = Number(p.monto_ars || 0);
      if (usd === 0 && ars > 0) set.add(p.fecha_pago.slice(0, 10));
    }
    for (const g of props.gastos) {
      if (!g.fecha) continue;
      const usd = Number(g.monto_usd || 0);
      const ars = Number(g.monto_ars || 0);
      const aplicado = Number(g.usd_rate_aplicado || 0);
      if (usd === 0 && ars > 0 && aplicado === 0) set.add(g.fecha.slice(0, 10));
    }
    return Array.from(set);
  }, [props.payments, props.gastos]);

  useEffect(() => {
    const missing = arsDatesNeeded.filter((d) => !blueRates.has(d));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/blue-rate?dates=${missing.join(",")}`);
        if (!res.ok) return;
        const j = (await res.json()) as { rates: Record<string, number | null> };
        if (cancelled) return;
        setBlueRates((prev) => {
          const next = new Map(prev);
          for (const [d, r] of Object.entries(j.rates || {})) {
            if (r && r > 0) next.set(d, r);
          }
          return next;
        });
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [arsDatesNeeded, blueRates]);

  const targetYM = selectedMonth.slice(0, 7);
  const monthLabel = useMemo(
    () => getFiscalMonth(parseLocalDate(selectedMonth)),
    [selectedMonth],
  );

  const snapshot = useMemo(() => {
    const ctx: UsdContext = {
      blueRates,
      monthlyRates: props.monthlyRates,
      usdRateGlobal: props.usdRateGlobal,
    };
    return computeCaja(
      props.payments,
      props.gastos,
      targetYM,
      ctx,
      modo,
      props.histStart,
    );
  }, [
    props.payments,
    props.gastos,
    props.monthlyRates,
    props.usdRateGlobal,
    props.histStart,
    targetYM,
    blueRates,
    modo,
  ]);

  const gastosFiltrados = useMemo(() => {
    return snapshot.gastosOperativos.filter((row) => {
      if (soloMovidos && !row.movido) return false;
      if (filtroCategoria && (row.g.categoria || "") !== filtroCategoria) return false;
      if (filtroConcepto) {
        const q = filtroConcepto.toLowerCase();
        const hay =
          (row.g.concepto || "").toLowerCase().includes(q) ||
          (row.g.pagado_a || "").toLowerCase().includes(q) ||
          (row.g.pagado_por || "").toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [snapshot.gastosOperativos, filtroConcepto, filtroCategoria, soloMovidos]);

  const categoriasSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of snapshot.gastosOperativos) if (r.g.categoria) s.add(r.g.categoria);
    return Array.from(s).sort();
  }, [snapshot.gastosOperativos]);

  function refresh() {
    router.refresh();
  }

  const netoNegativo = snapshot.neto < 0;
  const truncationWarning =
    (props.paymentsTruncated || props.gastosTruncated) &&
    [
      props.paymentsTruncated
        ? `payments ${props.payments.length}/${props.paymentsCount ?? "?"}`
        : null,
      props.gastosTruncated
        ? `gastos ${props.gastos.length}/${props.gastosCount ?? "?"}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-screen">
      {truncationWarning && (
        <div className="rounded-xl bg-[var(--yellow)]/10 border border-[var(--yellow)]/40 text-[var(--yellow)] px-4 py-3 text-sm">
          {"\u{26A0}️"} Alcanzado límite de registros: pueden faltar datos
          en los cálculos ({truncationWarning}). Ampliá el range en
          <code className="mx-1 font-mono">/caja/page.tsx</code>.
        </div>
      )}
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-4 bg-[var(--background)]/80 backdrop-blur border-b border-[var(--card-border)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>{"\u{1F3E6}"}</span> Status de Caja
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Sociedad Juanma-Fran &middot; Split 50 / 25 / 25 &middot;{" "}
              {modo === "mes" ? monthLabel : `Acumulado hasta ${monthLabel}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
            <div className="flex rounded-lg overflow-hidden border border-[var(--card-border)]">
              <button
                onClick={() => setModo("mes")}
                className={`px-3 py-2 text-sm ${
                  modo === "mes"
                    ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]"
                    : "bg-[var(--card-bg)] text-[var(--muted)] hover:text-white"
                }`}
              >
                Mes
              </button>
              <button
                onClick={() => setModo("acum")}
                className={`px-3 py-2 text-sm border-l border-[var(--card-border)] ${
                  modo === "acum"
                    ? "bg-[var(--purple)]/20 border-[var(--purple)] text-[var(--purple-light)]"
                    : "bg-[var(--card-bg)] text-[var(--muted)] hover:text-white"
                }`}
              >
                Acumulado
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Cash IN"
          value={snapshot.cashIn}
          icon={"\u{1F4B0}"}
          tone="green"
          sub="Cobros − refunds"
        />
        <KpiCard
          label="Cash OUT devengado"
          value={-Math.abs(snapshot.cashOut)}
          icon={"\u{1F4B8}"}
          tone="red"
          sub={
            modo === "mes"
              ? "Gastos devengados a este mes"
              : "Gastos desde el histórico"
          }
        />
        <KpiCard
          label="Neto"
          value={snapshot.neto}
          icon="="
          tone={snapshot.neto >= 0 ? "green" : "red"}
          sub="IN − OUT"
          strong
        />
      </div>

      {/* Split 50/25/25 */}
      <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Reparto 50 / 25 / 25</h2>
          <span className="text-xs text-[var(--muted)]">
            {netoNegativo ? "Mes en negativo" : "Sobre el Neto del mes"}
          </span>
        </div>

        {netoNegativo ? (
          <div className="w-full h-12 rounded-full bg-[var(--red)]/30 flex items-center justify-center text-sm text-white font-medium">
            Mes en negativo — no hay split que repartir (los socios cubren proporcional)
          </div>
        ) : (
          <div className="w-full h-12 rounded-full bg-white/10 overflow-hidden flex shadow-inner">
            <div
              className="bg-[var(--purple)]"
              style={{ width: "50%" }}
              title="Caja empresa 50%"
            />
            <div
              className="bg-[var(--green)]"
              style={{ width: "25%" }}
              title="Juanma 25%"
            />
            <div
              className="bg-[var(--yellow)]"
              style={{ width: "25%" }}
              title="Fran 25%"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LegendChip
            dotClass="bg-[var(--purple)]"
            label="Caja empresa (50%)"
            value={snapshot.caja50}
          />
          <LegendChip
            dotClass="bg-[var(--green)]"
            label="Juanma (25%)"
            value={snapshot.juanma25}
          />
          <LegendChip
            dotClass="bg-[var(--yellow)]"
            label="Fran (25%)"
            value={snapshot.fran25}
          />
        </div>
      </div>

      {/* Cards por bucket */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Caja empresa */}
        <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {"\u{1F3DB}️"} Caja empresa (50%)
          </div>
          <div className="text-3xl font-bold text-white mt-2">
            {formatUSD(snapshot.caja50)}
          </div>
          <div className="mt-3 text-xs text-[var(--muted)]">
            Asignado {modo === "mes" ? `en ${monthLabel}` : "en el rango acumulado"}
          </div>
          {Math.abs(snapshot.cashInPorSocio.otros) > 0.01 && (
            <div className="mt-3 pt-3 border-t border-[var(--card-border)]/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">
                  {"\u{26A0}️"} Cash sin asignar
                </span>
                <span className="font-mono text-[var(--yellow)]">
                  {formatUSD(snapshot.cashInPorSocio.otros)}
                </span>
              </div>
              <div className="text-[var(--muted)] mt-1">
                Cobros con receptor desconocido (binance/otros/null). No se
                atribuyen a Juanma ni a Fran.
              </div>
            </div>
          )}
        </div>

        {/* Juanma */}
        <SocioCard
          socio="Juanma"
          asignado={snapshot.juanma25}
          descuento={snapshot.descJuanma}
          transfer={snapshot.netoTransferJuanma}
          balance={snapshot.balanceJuanma}
          cashFisico={snapshot.cashInPorSocio.Juanma}
          dotClass="bg-[var(--green)]"
        />

        {/* Fran */}
        <SocioCard
          socio="Fran"
          asignado={snapshot.fran25}
          descuento={snapshot.descFran}
          transfer={snapshot.netoTransferFran}
          balance={snapshot.balanceFran}
          cashFisico={snapshot.cashInPorSocio.Fran}
          dotClass="bg-[var(--yellow)]"
        />
      </div>

      {/* Sugerencia */}
      {snapshot.sugerencia && (
        <div className="rounded-2xl bg-[var(--purple)]/10 border border-[var(--purple)]/40 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-white">
            <span className="mr-2">{"\u{1F4A1}"}</span>
            Sugerencia: <b>{snapshot.sugerencia.de}</b> → <b>{snapshot.sugerencia.a}</b>{" "}
            {formatUSD(snapshot.sugerencia.monto)}
          </div>
          <button
            onClick={() => setModalTransfer(true)}
            className="px-4 py-2 rounded-lg bg-[var(--purple)]/20 border border-[var(--purple)] text-[var(--purple-light)] text-sm hover:bg-[var(--purple)]/30"
          >
            Registrar transferencia →
          </button>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 justify-end">
        <button
          onClick={() => setModalTransfer(true)}
          className="px-3 py-2 rounded-lg bg-[var(--purple)]/20 border border-[var(--purple)]/60 text-[var(--purple-light)] text-sm hover:bg-[var(--purple)]/30"
        >
          + Transferencia socio
        </button>
        <button
          onClick={() => setModalDescuento(true)}
          className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm hover:border-[var(--purple)]"
        >
          + Descuento personal
        </button>
      </div>

      {/* Tabla gastos operativos devengados */}
      <section className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            Gastos operativos {modo === "mes" ? `(devengados ${monthLabel})` : "(acumulado)"}
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Buscar concepto…"
              value={filtroConcepto}
              onChange={(e) => setFiltroConcepto(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            >
              <option value="">Todas las categorías</option>
              {categoriasSet.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {modo === "mes" && (
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={soloMovidos}
                  onChange={(e) => setSoloMovidos(e.target.checked)}
                />
                Solo devengados a otro mes
              </label>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--muted)] uppercase text-xs">
                <th className="text-left py-2 pr-3">Fecha</th>
                <th className="text-left py-2 pr-3">Concepto</th>
                <th className="text-left py-2 pr-3">Categoría</th>
                <th className="text-left py-2 pr-3">Pagado por</th>
                <th className="text-left py-2 pr-3">Pagado a</th>
                <th className="text-right py-2 pr-3">Monto USD</th>
                <th className="text-left py-2 pr-3">Devengado</th>
              </tr>
            </thead>
            <tbody>
              {gastosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-[var(--muted)]">
                    Sin gastos operativos para este filtro.
                  </td>
                </tr>
              )}
              {gastosFiltrados.map((row) => (
                <tr
                  key={row.g.id}
                  className="border-t border-[var(--card-border)]/30 hover:bg-white/5"
                >
                  <td className="py-2 pr-3 text-white whitespace-nowrap">
                    {row.g.fecha}
                  </td>
                  <td className="py-2 pr-3 text-white">{row.g.concepto || "—"}</td>
                  <td className="py-2 pr-3 text-[var(--muted)]">
                    {row.g.categoria || "—"}
                  </td>
                  <td className="py-2 pr-3 text-[var(--muted)]">
                    {row.g.pagado_por || "—"}
                  </td>
                  <td className="py-2 pr-3 text-[var(--muted)]">
                    {row.g.pagado_a || "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-[var(--red)]">
                    {formatUSD(row.usd)}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--purple)]/10 text-[var(--purple-light)] text-xs">
                      {row.movido && <span>{"\u{26A1}"}</span>}
                      {row.devengadoYM}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--card-border)] font-bold">
                <td colSpan={5} className="py-2 pr-3 text-right text-white">
                  Total
                </td>
                <td className="py-2 pr-3 text-right font-mono text-[var(--red)]">
                  {formatUSD(gastosFiltrados.reduce((a, r) => a + r.usd, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Tabla transferencias */}
      <section className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Transferencias entre socios
          </h2>
          <button
            onClick={() => setModalTransfer(true)}
            className="px-3 py-2 rounded-lg bg-[var(--purple)]/20 border border-[var(--purple)]/60 text-[var(--purple-light)] text-xs hover:bg-[var(--purple)]/30"
          >
            + Registrar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--purple-light)] uppercase text-xs bg-[var(--purple)]/5">
                <th className="text-left py-2 pr-3">Fecha</th>
                <th className="text-left py-2 pr-3">De</th>
                <th className="text-left py-2 pr-3">A</th>
                <th className="text-right py-2 pr-3">USD</th>
                <th className="text-left py-2 pr-3">Billetera</th>
                <th className="text-left py-2 pr-3">Concepto</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.transferencias.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-[var(--muted)]">
                    Sin transferencias registradas en este período.
                  </td>
                </tr>
              )}
              {snapshot.transferencias.map((t) => (
                <tr
                  key={t.g.id}
                  className="border-t border-[var(--card-border)]/30 hover:bg-white/5"
                >
                  <td className="py-2 pr-3 text-white whitespace-nowrap">{t.g.fecha}</td>
                  <td className="py-2 pr-3 text-white">{normSocio(t.g.pagado_por)}</td>
                  <td className="py-2 pr-3 text-white">{normSocio(t.g.pagado_a)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-white">
                    {formatUSD(t.usd)}
                  </td>
                  <td className="py-2 pr-3 text-[var(--muted)]">
                    {t.g.billetera || "—"}
                  </td>
                  <td className="py-2 pr-3 text-[var(--muted)]">
                    {t.g.concepto || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabla descuentos personales */}
      <section className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Descuentos personales</h2>
          <button
            onClick={() => setModalDescuento(true)}
            className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-xs hover:border-[var(--purple)]"
          >
            + Registrar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--muted)] uppercase text-xs">
                <th className="text-left py-2 pr-3">Fecha</th>
                <th className="text-left py-2 pr-3">Socio</th>
                <th className="text-left py-2 pr-3">Motivo</th>
                <th className="text-right py-2 pr-3">USD</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.descuentos.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-[var(--muted)]">
                    Sin descuentos personales en este período.
                  </td>
                </tr>
              )}
              {snapshot.descuentos.map((d) => (
                <tr
                  key={d.g.id}
                  className="border-t border-[var(--card-border)]/30 hover:bg-white/5"
                >
                  <td className="py-2 pr-3 text-white whitespace-nowrap">{d.g.fecha}</td>
                  <td className="py-2 pr-3 text-white">{d.socio}</td>
                  <td className="py-2 pr-3 text-[var(--muted)]">{d.g.concepto || "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono text-[var(--red)]">
                    {formatUSD(d.usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Info team para tooltip futuro */}
      <div className="text-xs text-[var(--muted)] text-right">
        {props.team.length} team members activos
      </div>

      {/* Modales */}
      {modalTransfer && (
        <TransferenciaModal
          onClose={() => setModalTransfer(false)}
          onSuccess={() => {
            setModalTransfer(false);
            toast.success("Transferencia registrada");
            refresh();
          }}
          onError={(m) => toast.error(m)}
        />
      )}
      {modalDescuento && (
        <DescuentoModal
          onClose={() => setModalDescuento(false)}
          onSuccess={() => {
            setModalDescuento(false);
            toast.success("Descuento registrado");
            refresh();
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

// ---------- Subcomponents ----------

function KpiCard({
  label,
  value,
  icon,
  tone,
  sub,
  strong,
}: {
  label: string;
  value: number;
  icon: string;
  tone: "green" | "red" | "purple";
  sub?: string;
  strong?: boolean;
}) {
  const colorClass =
    tone === "green"
      ? "text-[var(--green)]"
      : tone === "red"
      ? "text-[var(--red)]"
      : "text-[var(--purple-light)]";
  const borderClass = strong
    ? tone === "green"
      ? "border-[var(--green)]/40"
      : tone === "red"
      ? "border-[var(--red)]/40"
      : "border-[var(--purple)]/40"
    : "border-[var(--card-border)]";
  return (
    <div
      className={`rounded-2xl bg-[var(--card-bg)] border ${borderClass} p-5`}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      <div className={`mt-2 text-3xl font-bold ${colorClass}`}>{formatUSD(value)}</div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function LegendChip({
  dotClass,
  label,
  value,
}: {
  dotClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-[var(--background)]/60 border border-[var(--card-border)] p-3 flex items-center gap-3">
      <span className={`inline-block w-3 h-3 rounded-full ${dotClass}`} />
      <div className="flex-1">
        <div className="text-xs text-[var(--muted)]">{label}</div>
        <div className="text-lg font-semibold text-white">{formatUSD(value)}</div>
      </div>
    </div>
  );
}

function SocioCard({
  socio,
  asignado,
  descuento,
  transfer,
  balance,
  cashFisico,
  dotClass,
}: {
  socio: "Juanma" | "Fran";
  asignado: number;
  descuento: number;
  transfer: number;
  balance: number;
  cashFisico: number;
  dotClass: string;
}) {
  const borderClass =
    balance > 100
      ? "border-[var(--green)]/40"
      : balance < -100
      ? "border-[var(--red)]/40"
      : "border-[var(--card-border)]";
  const alertaDescuento = descuento > asignado + 0.01;
  return (
    <div
      className={`rounded-2xl bg-[var(--card-bg)] border ${borderClass} p-5 space-y-2`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
        <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
        {socio} (25%)
      </div>
      <div className="text-3xl font-bold text-white">{formatUSD(balance)}</div>
      <div className="text-xs text-[var(--muted)]">Pendiente por retirar</div>

      <div className="pt-3 border-t border-[var(--card-border)]/40 space-y-1 text-sm">
        <RowKV label="Asignado 25%" value={asignado} tone="neutral" />
        <RowKV label="Descuento personal" value={-descuento} tone="red" />
        <RowKV
          label={transfer >= 0 ? "Transfer recibido" : "Transfer enviado"}
          value={transfer}
          tone={transfer >= 0 ? "green" : "red"}
        />
        <RowKV label="Cash cobrado físico" value={cashFisico} tone="neutral" muted />
      </div>

      {alertaDescuento && (
        <div className="mt-2 text-xs px-2 py-1 rounded bg-[var(--yellow)]/10 text-[var(--yellow)] border border-[var(--yellow)]/40">
          {"\u{26A0}️"} Descuentos exceden el 25% asignado del mes
        </div>
      )}
    </div>
  );
}

function RowKV({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "neutral";
  muted?: boolean;
}) {
  const color =
    tone === "green"
      ? "text-[var(--green)]"
      : tone === "red"
      ? "text-[var(--red)]"
      : muted
      ? "text-[var(--muted)]"
      : "text-white";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={`font-mono ${color}`}>{formatUSD(value)}</span>
    </div>
  );
}

// ---------- Modals ----------

function TransferenciaModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const today = todayInSP();
  const [fecha, setFecha] = useState(today);
  const [devengadoMes, setDevengadoMes] = useState(today.slice(0, 7));
  const [desde, setDesde] = useState<"JUANMA" | "FRAN">("JUANMA");
  const [hacia, setHacia] = useState<"JUANMA" | "FRAN">("FRAN");
  const [montoUsd, setMontoUsd] = useState("");
  const [montoArs, setMontoArs] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (desde === hacia) {
      onError("Desde y hacia deben ser socios distintos");
      return;
    }
    const usd = Number(montoUsd) || 0;
    const ars = Number(montoArs) || 0;
    if (usd <= 0 && ars <= 0) {
      onError("Ingresá monto USD o ARS");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(devengadoMes)) {
      onError("Devengado a mes inválido (YYYY-MM)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/caja/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          desde,
          hacia,
          monto_usd: usd || undefined,
          monto_ars: ars || undefined,
          notas: notas || undefined,
          devengado_mes: devengadoMes,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onError(j.error || "Error al registrar");
        return;
      }
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4"
      >
        <h3 className="text-base font-semibold text-white">Registrar transferencia socio</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              className="modal-input"
            />
          </Field>
          <Field label="Devengar a mes">
            <input
              type="month"
              value={devengadoMes}
              onChange={(e) => setDevengadoMes(e.target.value)}
              required
              min="2020-01"
              max="2100-12"
              className="modal-input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <select
              value={desde}
              onChange={(e) => setDesde(e.target.value as "JUANMA" | "FRAN")}
              className="modal-input"
            >
              <option value="JUANMA">Juanma</option>
              <option value="FRAN">Fran</option>
            </select>
          </Field>
          <Field label="Hacia">
            <select
              value={hacia}
              onChange={(e) => setHacia(e.target.value as "JUANMA" | "FRAN")}
              className="modal-input"
            >
              <option value="JUANMA">Juanma</option>
              <option value="FRAN">Fran</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto USD">
            <input
              type="number"
              step="0.01"
              value={montoUsd}
              onChange={(e) => setMontoUsd(e.target.value)}
              placeholder="0"
              className="modal-input"
            />
          </Field>
          <Field label="Monto ARS">
            <input
              type="number"
              step="1"
              value={montoArs}
              onChange={(e) => setMontoArs(e.target.value)}
              placeholder="0"
              className="modal-input"
            />
          </Field>
        </div>

        <Field label="Notas (opcional)">
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: pago Binance"
            className="modal-input"
          />
        </Field>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-sm hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </div>

        <style jsx>{`
          .modal-input {
            width: 100%;
            padding: 8px 12px;
            border-radius: 8px;
            background: var(--background);
            border: 1px solid var(--card-border);
            color: white;
            font-size: 14px;
            outline: none;
          }
          .modal-input:focus {
            border-color: var(--purple);
          }
        `}</style>
      </form>
    </div>
  );
}

function DescuentoModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const today = todayInSP();
  const [fecha, setFecha] = useState(today);
  const [devengadoMes, setDevengadoMes] = useState(today.slice(0, 7));
  const [socio, setSocio] = useState<"JUANMA" | "FRAN">("JUANMA");
  const [concepto, setConcepto] = useState("");
  const [montoUsd, setMontoUsd] = useState("");
  const [montoArs, setMontoArs] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (concepto.trim().length < 3) {
      onError("Motivo muy corto");
      return;
    }
    const usd = Number(montoUsd) || 0;
    const ars = Number(montoArs) || 0;
    if (usd <= 0 && ars <= 0) {
      onError("Ingresá monto USD o ARS");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(devengadoMes)) {
      onError("Devengado a mes inválido (YYYY-MM)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/caja/descuento-personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          socio,
          concepto,
          monto_usd: usd || undefined,
          monto_ars: ars || undefined,
          devengado_mes: devengadoMes,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onError(j.error || "Error al registrar");
        return;
      }
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4"
      >
        <h3 className="text-base font-semibold text-white">Registrar descuento personal</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              className="modal-input"
            />
          </Field>
          <Field label="Devengar a mes">
            <input
              type="month"
              value={devengadoMes}
              onChange={(e) => setDevengadoMes(e.target.value)}
              required
              min="2020-01"
              max="2100-12"
              className="modal-input"
            />
          </Field>
        </div>

        <Field label="Socio">
          <select
            value={socio}
            onChange={(e) => setSocio(e.target.value as "JUANMA" | "FRAN")}
            className="modal-input"
          >
            <option value="JUANMA">Juanma</option>
            <option value="FRAN">Fran</option>
          </select>
        </Field>

        <Field label="Motivo">
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Mundial jul-ago 2026"
            className="modal-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto USD">
            <input
              type="number"
              step="0.01"
              value={montoUsd}
              onChange={(e) => setMontoUsd(e.target.value)}
              placeholder="0"
              className="modal-input"
            />
          </Field>
          <Field label="Monto ARS">
            <input
              type="number"
              step="1"
              value={montoArs}
              onChange={(e) => setMontoArs(e.target.value)}
              placeholder="0"
              className="modal-input"
            />
          </Field>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-sm hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </div>

        <style jsx>{`
          .modal-input {
            width: 100%;
            padding: 8px 12px;
            border-radius: 8px;
            background: var(--background);
            border: 1px solid var(--card-border);
            color: white;
            font-size: 14px;
            outline: none;
          }
          .modal-input:focus {
            border-color: var(--purple);
          }
        `}</style>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-[var(--muted)] uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

// Silence unused imports warnings if any tree-shaking helper flags them.
void getFiscalStart;
void getFiscalEnd;
void toDateString;
