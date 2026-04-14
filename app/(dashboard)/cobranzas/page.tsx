import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  fetchCobranzasQueue,
  fetchAllPendingPaymentsAsItems,
  fetchAllPaidPayments,
  fetchAuditCuotas,
  fetchAuditRenovaciones,
} from "@/lib/queries/cobranzas";
import { fetchAgentTasks } from "@/lib/queries/agent-tasks";
import { getUsdRate } from "@/lib/queries/settings";
import CobranzasClient from "./CobranzasClient";

export const dynamic = "force-dynamic";

export default async function CobranzasPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) {
    redirect("/");
  }

  const [queue, allTasks, allPendingItems, allPaidPayments, auditCuotas, auditRenovaciones, usdRate] =
    await Promise.all([
      fetchCobranzasQueue(),
      fetchAgentTasks(),
      fetchAllPendingPaymentsAsItems(),
      fetchAllPaidPayments(),
      fetchAuditCuotas(),
      fetchAuditRenovaciones(),
      getUsdRate(),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cobranzas</h1>
      </div>
      <CobranzasClient
        initialQueue={queue}
        allPendingItems={allPendingItems}
        allPaidPayments={allPaidPayments}
        allTasks={allTasks}
        auditCuotas={auditCuotas}
        auditRenovaciones={auditRenovaciones}
        usdRate={usdRate}
        session={session}
      />
    </div>
  );
}
