/**
 * Cierre de mes — Split de socios Juanma / Fran (50/50).
 *
 * Computa para el mes elegido:
 *   - Cash cobrado por cada socio (Juanma / Fran) según payments.receptor
 *   - Cash cobrado por otros (Valen / Mati / etc.) → va al pool 50/50
 *   - Gastos pagados por cada socio según gastos.pagado_por
 *   - Comisiones a pagar al equipo del mes (computadas con misma lógica que /finanzas)
 *   - Lo que le toca a cada socio = (pool_socios − gastos_total − comisiones_total) / 2
 *   - Diferencia: quién le debe a quién y cuánto
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, getFiscalMonth, getToday, toDateString } from "@/lib/date-utils";
import { computeTeamCommissions } from "@/lib/commissions";
import { computeComisionesDetail } from "@/lib/comisiones-detail";
import SociosClient from "./SociosClient";

export const dynamic = "force-dynamic";

export default async function CierreSocios({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sp = await searchParams;
  const today = getToday();
  // mes esperado: YYYY-MM-01
  const mesParam = sp.mes;
  const baseDate = mesParam ? new Date(mesParam + "T00:00:00") : today;
  if (isNaN(baseDate.getTime())) baseDate.setTime(today.getTime());

  const start = getFiscalStart(baseDate);
  const end = getFiscalEnd(baseDate);
  const startStr = toDateString(start);
  const endStr = toDateString(end);

  const supabase = createServerClient();

  const targetYM = startStr.slice(0, 7); // "2026-05"

  // ─ Payments del mes (cash collected) + payments del mes completo (incluye refunds) para comisiones detalle
  const [paymentsRes, gastosRes, leadsRes, leadsFullRes, teamRes, campaignsRes, allPaymentsForCommRes] = await Promise.all([
    supabase
      .from("payments")
      .select("id, lead_id, monto_usd, monto_ars, receptor, fecha_pago, estado, metodo_pago, numero_cuota, es_renovacion")
      .eq("estado", "pagado")
      .gte("fecha_pago", startStr)
      .lte("fecha_pago", endStr)
      .range(0, 4999),
    supabase
      .from("gastos")
      .select("id, fecha, concepto, categoria, monto_usd, monto_ars, billetera, pagado_por, pagado_a, estado")
      .gte("fecha", startStr)
      .lte("fecha", endStr)
      .order("fecha", { ascending: true }),
    // leads y campaigns: para calcular comisiones del mes
    supabase
      .from("leads")
      .select("id, closer_id, setter_id, utm_medium, programa_pitcheado")
      .range(0, 9999),
    // leads completos con nombre + ticket — para el cálculo de comisiones detalle
    supabase
      .from("leads")
      .select("id, nombre, closer_id, setter_id, utm_medium, programa_pitcheado")
      .range(0, 9999),
    supabase
      .from("team_members")
      .select("id, user_id, nombre, etiqueta, rol, email, telefono, fecha_nacimiento, foto_url, observaciones, is_admin, is_closer, is_setter, is_cobranzas, is_seguimiento, comision_pct, pin, activo")
      .eq("activo", true),
    supabase.from("utm_campaigns").select("medium, setter_id"),
    // payments del mes (pagados + refund) para computeComisionesDetail
    supabase
      .from("payments")
      .select("id, lead_id, numero_cuota, monto_usd, fecha_pago, estado, es_renovacion, descuento_comision_closer_usd, descuento_comision_setter_usd, aplicado_en_comisiones_mes")
      .gte("fecha_pago", startStr)
      .lte("fecha_pago", endStr)
      .range(0, 4999),
  ]);

  // Calcular comisiones del mes (Valen scheme 7/5/7 + setter 3%) — mismo método que /finanzas/cierre-mes.
  // Para esto necesitamos también los pagos del mes (ya los tenemos).
  const paymentsForComm = (paymentsRes.data ?? []) as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>;
  const leads = (leadsRes.data ?? []) as Array<{ id: string; closer_id: string | null; setter_id: string | null; utm_medium: string | null; programa_pitcheado: string | null }>;
  const team = (teamRes.data ?? []) as Array<{ id: string; nombre: string; is_closer: boolean; is_setter: boolean }>;
  const campaigns = (campaignsRes.data ?? []) as Array<{ medium: string | null; setter_id: string | null }>;

  const teamCommissions = computeTeamCommissions({
    leads,
    payments: paymentsForComm,
    team,
    campaigns,
    monthStart: startStr,
    monthEnd: endStr,
  });

  // Cálculo detallado con tier multiplier (mismo método que /comisiones).
  // Da el total real a pagar — ej. Valentino x1.3 en lugar de 7% fijo.
  const leadsFull = (leadsFullRes.data ?? []) as Array<{ id: string; nombre: string | null; closer_id: string | null; setter_id: string | null; utm_medium: string | null; programa_pitcheado: string | null }>;
  const allPaymentsForComm = (allPaymentsForCommRes.data ?? []) as Array<{
    id: string;
    lead_id: string | null;
    numero_cuota: number;
    monto_usd: number;
    fecha_pago: string | null;
    estado: string;
    es_renovacion: boolean;
    descuento_comision_closer_usd?: number | null;
    descuento_comision_setter_usd?: number | null;
    aplicado_en_comisiones_mes?: string | null;
  }>;
  const teamFull = (teamRes.data ?? []) as Array<{
    id: string;
    user_id: string | null;
    nombre: string;
    etiqueta: string | null;
    rol: string | null;
    email: string | null;
    telefono: string | null;
    fecha_nacimiento: string | null;
    foto_url: string | null;
    observaciones: string | null;
    is_admin: boolean;
    is_closer: boolean;
    is_setter: boolean;
    is_cobranzas: boolean;
    is_seguimiento: boolean;
    comision_pct: number;
    pin: string | null;
    activo: boolean;
  }>;
  const comisionesDetalle = computeComisionesDetail({
    targetYM,
    leads: leadsFull,
    payments: allPaymentsForComm,
    team: teamFull,
    campaigns,
  });
  const totalComisionesReal = comisionesDetalle.total_a_pagar;

  // Refunds del mes (descuento del cash)
  const refundsRes = await supabase
    .from("payments")
    .select("monto_usd, monto_ars, receptor, fecha_pago")
    .eq("estado", "refund")
    .gte("fecha_pago", startStr)
    .lte("fecha_pago", endStr);
  const refunds = (refundsRes.data ?? []) as Array<{ monto_usd: number | null; monto_ars: number | null; receptor: string | null; fecha_pago: string | null }>;

  return (
    <SociosClient
      mes={startStr}
      mesLabel={getFiscalMonth(baseDate)}
      payments={(paymentsRes.data ?? []) as never[]}
      refunds={refunds as never[]}
      gastos={(gastosRes.data ?? []) as never[]}
      teamCommissions={teamCommissions}
      totalComisionesReal={totalComisionesReal}
    />
  );
}
