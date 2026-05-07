import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getToday } from "@/lib/date-utils";
import type { RenewalQueueRow } from "@/lib/types";
import RenovacionesClient from "./RenovacionesClient";

export const dynamic = "force-dynamic";

export default async function RenovacionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const supabase = createServerClient();

  const [
    { data: renewalQueue },
    { data: renewalHistory },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("v_renewal_queue")
      .select("*")
      .order("dias_restantes", { ascending: true }),
    supabase
      .from("renewal_history")
      .select("*, client:clients(id, nombre, programa), responsable:team_members(id, nombre)")
      .order("fecha_renovacion", { ascending: false })
      .limit(100),
    supabase
      .from("clients")
      .select("id, nombre, programa, estado, fecha_onboarding, fecha_offboarding, total_dias_programa, health_score")
      .in("estado", ["activo", "inactivo"]),
  ]);

  // Calculate metrics
  const allClients = clients ?? [];
  const today = getToday();
  const ymToday = today.toISOString().slice(0, 7);
  const monthStart = `${ymToday}-01`;
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  function clientVenc(c: { fecha_onboarding: string | null; total_dias_programa: number | null }) {
    if (!c.fecha_onboarding) return null;
    const onb = new Date(c.fecha_onboarding);
    onb.setDate(onb.getDate() + (c.total_dias_programa ?? 90));
    return onb;
  }

  // Global
  const expiredCount = allClients.filter((c) => {
    const v = clientVenc(c);
    return v && v < today;
  }).length;

  const allRenewals = (renewalHistory ?? []) as any[];

  // Dedup renewals: misma client_id + mismo mes_renovacion → una sola
  const seen = new Set<string>();
  const dedupedRenewals = allRenewals.filter((r: any) => {
    const key = `${r.client_id}_${(r.fecha_renovacion || "").slice(0, 7)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const renewedCount = dedupedRenewals.filter((r: any) => r.estado === "pago").length;
  const totalRevenue = dedupedRenewals
    .filter((r: any) => r.estado === "pago")
    .reduce((sum: number, r: any) => sum + (r.monto_total ?? 0), 0);

  const tasaRenovacion =
    expiredCount > 0 ? Math.round((renewedCount / expiredCount) * 100) : 0;
  const revenuePromedio =
    renewedCount > 0 ? Math.round(totalRevenue / renewedCount) : 0;
  const churnRate =
    expiredCount > 0
      ? Math.round(((expiredCount - renewedCount) / expiredCount) * 100)
      : 0;

  // Mensual: vencimientos en el mes y renovaciones cargadas en el mes
  const expiredThisMonth = allClients.filter((c) => {
    const v = clientVenc(c);
    if (!v) return false;
    const ym = v.toISOString().slice(0, 10);
    return ym >= monthStart && ym <= monthEnd;
  }).length;

  const renewedThisMonth = dedupedRenewals.filter((r: any) => {
    if (r.estado !== "pago") return false;
    const fr = (r.fecha_renovacion || "").slice(0, 10);
    return fr >= monthStart && fr <= monthEnd;
  }).length;

  const tasaRenovacionMes = expiredThisMonth > 0 ? Math.round((renewedThisMonth / expiredThisMonth) * 100) : 0;
  const churnRateMes = expiredThisMonth > 0 ? Math.round(((expiredThisMonth - renewedThisMonth) / expiredThisMonth) * 100) : 0;

  // Dedup queue (mismo cliente nombre normalizado solo aparece 1 vez)
  const queueSeen = new Set<string>();
  const dedupedQueue = (renewalQueue ?? []).filter((q: any) => {
    const key = (q.nombre || "").toLowerCase().trim();
    if (!key || queueSeen.has(key)) return false;
    queueSeen.add(key);
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Renovaciones</h1>
      <RenovacionesClient
        renewalQueue={dedupedQueue as RenewalQueueRow[]}
        renewalHistory={dedupedRenewals}
        metrics={{
          tasaRenovacion,
          revenuePromedio,
          churnRate,
          totalRevenue,
          renewedCount,
          expiredCount,
          tasaRenovacionMes,
          churnRateMes,
          renewedThisMonth,
          expiredThisMonth,
        }}
        session={session}
      />
    </div>
  );
}
