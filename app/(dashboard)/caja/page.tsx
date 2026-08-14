import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getUsdRate } from "@/lib/queries/settings";
import {
  getFiscalStart,
  getFiscalEnd,
  parseLocalDate,
  toDateString,
} from "@/lib/date-utils";
import CajaClient from "./CajaClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ mes?: string; modo?: string }>;
}

const HIST_START = "2026-01-01";

export default async function CajaPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const params = await searchParams;
  const modo: "mes" | "acum" = params.modo === "acum" ? "acum" : "mes";

  // Default: mes actual (getFiscalStart usa SP timezone).
  // Validamos que params.mes sea YYYY-MM-DD; si no matchea, caemos al default
  // en vez de romper con parseLocalDate("undefined") o similar.
  const MES_RE = /^\d{4}-\d{2}-\d{2}$/;
  const initialMonth =
    params.mes && MES_RE.test(params.mes) ? params.mes : toDateString(getFiscalStart());
  const monthStart = getFiscalStart(parseLocalDate(initialMonth));
  const monthEnd = getFiscalEnd(monthStart);

  const monthStartStr = toDateString(monthStart);
  const monthEndStr = toDateString(monthEnd);
  const targetMonthYM = monthStartStr.slice(0, 7);
  const histStartYM = HIST_START.slice(0, 7);

  // Rango de queries:
  //  - payments: por fecha_pago (calendario natural).
  //  - gastos: por devengado_mes (YYYY-MM), no por fecha física. Un gasto
  //    pagado en abril puede estar devengado a marzo si el admin lo declaró
  //    así. Antes se traía hasta fin del mes siguiente y en el cliente se
  //    movía con regex sobre el concepto; ahora el mes es un campo explícito.
  const paymentsFrom = modo === "acum" ? HIST_START : monthStartStr;
  const paymentsTo = monthEndStr;
  const gastosDevengadoFrom = modo === "acum" ? histStartYM : targetMonthYM;
  const gastosDevengadoTo = targetMonthYM;

  const sb = createServerClient();
  // NOTA: /caja es global de la sociedad, NO se filtra por nicho (a diferencia
  // de /cierre-mes o /finanzas donde sí se aplica getNichoFilter()).
  // Los range() son defensivos: pedimos count exacto y avisamos si truncó.
  const [paymentsRes, gastosRes, ratesRes, teamRes] = await Promise.all([
    sb
      .from("payments")
      .select(
        "id, lead_id, fecha_pago, monto_usd, monto_ars, receptor, estado, es_renovacion",
        { count: "exact" },
      )
      .in("estado", ["pagado", "refund"])
      .gte("fecha_pago", paymentsFrom)
      .lte("fecha_pago", paymentsTo)
      .range(0, 9999),
    sb
      .from("gastos")
      .select(
        "id, fecha, concepto, categoria, monto_usd, monto_ars, billetera, pagado_a, pagado_por, estado, usd_rate_aplicado, nicho, devengado_mes",
        { count: "exact" },
      )
      .gte("devengado_mes", gastosDevengadoFrom)
      .lte("devengado_mes", gastosDevengadoTo)
      .order("fecha", { ascending: true })
      .range(0, 4999),
    sb.from("usd_rate_history").select("mes, rate"),
    sb.from("team_members").select("id, nombre").eq("activo", true),
  ]);

  const paymentsData = paymentsRes.data ?? [];
  const gastosData = gastosRes.data ?? [];
  const paymentsCount = paymentsRes.count ?? null;
  const gastosCount = gastosRes.count ?? null;
  const paymentsTruncated =
    paymentsCount != null && paymentsCount > paymentsData.length;
  const gastosTruncated =
    gastosCount != null && gastosCount > gastosData.length;

  if (paymentsTruncated) {
    console.warn(
      `[caja] payments truncated: ${paymentsData.length}/${paymentsCount} (range=0-9999)`,
    );
  }
  if (gastosTruncated) {
    console.warn(
      `[caja] gastos truncated: ${gastosData.length}/${gastosCount} (range=0-4999)`,
    );
  }

  const usdRate = await getUsdRate();

  return (
    <CajaClient
      initialMonth={initialMonth}
      initialModo={modo}
      histStart={HIST_START}
      payments={paymentsData as never[]}
      gastos={gastosData as never[]}
      monthlyRates={(ratesRes.data ?? []) as never[]}
      team={(teamRes.data ?? []) as never[]}
      usdRateGlobal={usdRate}
      paymentsTruncated={paymentsTruncated}
      gastosTruncated={gastosTruncated}
      paymentsCount={paymentsCount}
      gastosCount={gastosCount}
    />
  );
}
