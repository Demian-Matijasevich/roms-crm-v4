import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchIgMetrics } from "@/lib/queries/ig-metrics";
import IgMetricsClient from "./IgMetricsClient";

export const dynamic = "force-dynamic";

export default async function IgMetricsPage() {
  const auth = await requireAdmin();
  if ("error" in auth) redirect("/login");

  const metrics = await fetchIgMetrics();

  return <IgMetricsClient metrics={metrics} />;
}
