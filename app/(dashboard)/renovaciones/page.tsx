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
  const expiredCount = allClients.filter((c) => {
    if (!c.fecha_onboarding) return false;
    const venc = new Date(c.fecha_onboarding);
    venc.setDate(venc.getDate() + (c.total_dias_programa ?? 90));
    return venc < getToday();
  }).length;

  const allRenewals = (renewalHistory ?? []) as any[];
  const renewedCount = allRenewals.filter((r: any) => r.estado === "pago").length;
  const totalRevenue = allRenewals
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Renovaciones</h1>
      <RenovacionesClient
        renewalQueue={(renewalQueue ?? []) as RenewalQueueRow[]}
        renewalHistory={allRenewals}
        metrics={{
          tasaRenovacion,
          revenuePromedio,
          churnRate,
          totalRevenue,
          renewedCount,
          expiredCount,
        }}
        session={session}
      />
    </div>
  );
}
