import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import PresentacionClient from "./PresentacionClient";

export const dynamic = "force-dynamic";

export default async function PresentacionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const [leadsRes, paymentsRes, clientsRes, ratesRes, gastosRes] = await Promise.all([
    sb.from("leads").select("id, programa_pitcheado, ticket_total, estado, fecha_llamada").range(0, 9999),
    sb.from("payments").select("lead_id, monto_usd, fecha_pago, estado").eq("estado", "pagado").range(0, 9999),
    sb.from("clients").select("id, lead_id, programa, fecha_onboarding, fecha_offboarding, total_dias_programa, estado").not("fecha_onboarding", "is", null).range(0, 4999),
    sb.from("usd_rate_history").select("*").order("mes", { ascending: false }),
    sb.from("gastos").select("id, categoria, billetera, monto_usd, monto_ars, fecha, usd_rate_aplicado").range(0, 4999),
  ]);

  return (
    <PresentacionClient
      leads={(leadsRes.data ?? []) as Array<{ id: string; programa_pitcheado: string | null; ticket_total: number; estado: string | null; fecha_llamada: string | null }>}
      payments={(paymentsRes.data ?? []) as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>}
      clients={(clientsRes.data ?? []) as Array<{ id: string; lead_id: string | null; programa: string | null; fecha_onboarding: string | null; fecha_offboarding: string | null; total_dias_programa: number; estado: string }>}
      rates={(ratesRes.data ?? []) as Array<{ mes: string; rate: number }>}
      gastos={(gastosRes.data ?? []) as Array<{ id: string; categoria: string; billetera: string; monto_usd: number; monto_ars: number; fecha: string; usd_rate_aplicado: number | null }>}
    />
  );
}
