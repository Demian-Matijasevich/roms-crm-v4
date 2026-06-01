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
import { getNichoFilter } from "@/lib/vista";
import { createServerClient } from "@/lib/supabase-server";
import CobranzasClient from "./CobranzasClient";

export const dynamic = "force-dynamic";

export default async function CobranzasPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) {
    redirect("/");
  }

  const nicho = await getNichoFilter();
  // Si hay vista filtrada, calculamos el set de payment_ids cuyos leads
  // pertenecen al nicho activo. Después filtramos las listas localmente.
  let allowedPaymentIds: Set<string> | null = null;
  if (nicho) {
    const sb = createServerClient();
    const { data: leadsN } = await sb.from("leads").select("id").eq("nicho", nicho).range(0, 9999);
    const leadSet = new Set((leadsN || []).map((l: { id: string }) => l.id));
    const { data: payN } = await sb
      .from("payments")
      .select("id, lead_id")
      .in("lead_id", [...leadSet])
      .range(0, 9999);
    allowedPaymentIds = new Set((payN || []).map((p: { id: string }) => p.id));
  }

  const [queueRaw, allTasks, allPendingItemsRaw, allPaidPaymentsRaw, auditCuotasRaw, auditRenovacionesRaw, usdRate] =
    await Promise.all([
      fetchCobranzasQueue(),
      fetchAgentTasks(),
      fetchAllPendingPaymentsAsItems(),
      fetchAllPaidPayments(),
      fetchAuditCuotas(),
      fetchAuditRenovaciones(),
      getUsdRate(),
    ]);

  // Filtro local: si el item tiene payment_id y existe el set, validar.
  // Renovaciones no tienen payment_id, las dejamos pasar siempre.
  const filterByPay = <T extends { payment_id?: string | null; tipo?: string }>(arr: T[]) =>
    allowedPaymentIds
      ? arr.filter((x) => !x.payment_id || x.tipo === "renovacion" || allowedPaymentIds!.has(x.payment_id))
      : arr;

  const queue = filterByPay(queueRaw as Array<{ payment_id?: string | null; tipo?: string }>) as typeof queueRaw;
  const allPendingItems = filterByPay(allPendingItemsRaw as Array<{ payment_id?: string | null; tipo?: string }>) as typeof allPendingItemsRaw;
  const allPaidPayments = allowedPaymentIds
    ? allPaidPaymentsRaw.filter((p: { id: string }) => allowedPaymentIds!.has(p.id))
    : allPaidPaymentsRaw;
  // AuditCuotaRow.id es el id del payment
  const auditCuotas = allowedPaymentIds
    ? auditCuotasRaw.filter((a) => allowedPaymentIds!.has(a.id))
    : auditCuotasRaw;
  const auditRenovaciones = auditRenovacionesRaw;

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
