import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getUsdRate } from "@/lib/queries/settings";
import CierreMesClient from "./CierreMesClient";

export const dynamic = "force-dynamic";

export default async function CierreMesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const [leadsRes, paymentsRes, clientsRes, renewalsRes, gastosRes, teamRes, campaignsRes, ratesRes] = await Promise.all([
    sb.from("leads").select("id, nombre, programa_pitcheado, ticket_total, estado, fecha_llamada, fecha_agendado, closer_id, setter_id, utm_medium, utm_source, plan_pago, lead_calificado").range(0, 9999),
    sb.from("payments").select("id, lead_id, monto_usd, monto_ars, fecha_pago, fecha_vencimiento, estado, numero_cuota, metodo_pago, receptor, es_renovacion").range(0, 9999),
    sb.from("clients").select("id, lead_id, nombre, programa, fecha_onboarding, fecha_offboarding, total_dias_programa, estado").range(0, 4999),
    sb.from("renewal_history").select("id, client_id, tipo_renovacion, programa_anterior, programa_nuevo, monto_total, plan_pago, estado, fecha_renovacion, client:clients(nombre, programa)").range(0, 999),
    sb.from("gastos").select("id, fecha, concepto, categoria, billetera, monto_usd, monto_ars, usd_rate_aplicado, estado, pagado_por, pagado_a").range(0, 4999),
    sb.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true),
    sb.from("utm_campaigns").select("medium, setter_id"),
    sb.from("usd_rate_history").select("mes, rate"),
  ]);
  const usdRate = await getUsdRate();

  return (
    <CierreMesClient
      leads={(leadsRes.data ?? []) as never[]}
      payments={(paymentsRes.data ?? []) as never[]}
      clients={(clientsRes.data ?? []) as never[]}
      renewals={(renewalsRes.data ?? []) as never[]}
      gastos={(gastosRes.data ?? []) as never[]}
      team={(teamRes.data ?? []) as never[]}
      campaigns={(campaignsRes.data ?? []) as never[]}
      rates={(ratesRes.data ?? []) as never[]}
      usdRate={usdRate}
    />
  );
}
