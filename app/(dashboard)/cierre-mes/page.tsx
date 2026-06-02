import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getUsdRate } from "@/lib/queries/settings";
import { getNichoFilter, getVista, VISTA_LABELS } from "@/lib/vista";
import CierreMesClient from "./CierreMesClient";

export const dynamic = "force-dynamic";

export default async function CierreMesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const nicho = await getNichoFilter();
  const vista = await getVista();

  // Leads filtrados por nicho si corresponde
  let leadsQuery = sb
    .from("leads")
    .select("id, nombre, programa_pitcheado, ticket_total, estado, fecha_llamada, fecha_agendado, closer_id, setter_id, utm_medium, utm_source, plan_pago, lead_calificado, nicho")
    .range(0, 9999);
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);

  const [leadsRes, paymentsRes, clientsRes, renewalsRes, gastosRes, teamRes, campaignsRes, ratesRes] = await Promise.all([
    leadsQuery,
    sb.from("payments").select("id, lead_id, monto_usd, monto_ars, fecha_pago, fecha_vencimiento, estado, numero_cuota, metodo_pago, receptor, es_renovacion").range(0, 9999),
    sb.from("clients").select("id, lead_id, nombre, programa, fecha_onboarding, fecha_offboarding, total_dias_programa, estado").range(0, 4999),
    sb.from("renewal_history").select("id, client_id, tipo_renovacion, programa_anterior, programa_nuevo, monto_total, plan_pago, estado, fecha_renovacion, client:clients(nombre, programa)").range(0, 999),
    sb.from("gastos").select("id, fecha, concepto, categoria, billetera, monto_usd, monto_ars, usd_rate_aplicado, estado, pagado_por, pagado_a").range(0, 4999),
    sb.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true),
    sb.from("utm_campaigns").select("medium, setter_id"),
    sb.from("usd_rate_history").select("mes, rate"),
  ]);
  const usdRate = await getUsdRate();

  const leadsList = (leadsRes.data ?? []) as Array<{ id: string }>;
  const leadIdsNicho = nicho ? new Set(leadsList.map((l) => l.id)) : null;

  // Filtrar payments y clients/renewals por leads del nicho
  const payments = leadIdsNicho
    ? ((paymentsRes.data ?? []) as Array<{ lead_id: string | null }>).filter(
        (p) => p.lead_id && leadIdsNicho.has(p.lead_id)
      )
    : (paymentsRes.data ?? []);
  const clients = leadIdsNicho
    ? ((clientsRes.data ?? []) as Array<{ lead_id: string | null }>).filter(
        (c) => c.lead_id && leadIdsNicho.has(c.lead_id)
      )
    : (clientsRes.data ?? []);
  const clientIdsNicho = leadIdsNicho
    ? new Set((clients as Array<{ id: string }>).map((c) => c.id))
    : null;
  const renewals = clientIdsNicho
    ? ((renewalsRes.data ?? []) as Array<{ client_id: string | null }>).filter(
        (r) => r.client_id && clientIdsNicho.has(r.client_id)
      )
    : (renewalsRes.data ?? []);

  // vistaLabel para futuro uso en banner del cliente; no se pasa como prop hasta que se acepte
  void vista; void VISTA_LABELS;

  return (
    <CierreMesClient
      leads={leadsList as never[]}
      payments={payments as never[]}
      clients={clients as never[]}
      renewals={renewals as never[]}
      gastos={(gastosRes.data ?? []) as never[]}
      team={(teamRes.data ?? []) as never[]}
      campaigns={(campaignsRes.data ?? []) as never[]}
      rates={(ratesRes.data ?? []) as never[]}
      usdRate={usdRate}
    />
  );
}
