/**
 * /admin/bulk-gastos-nicho
 * Tabla simple para retagear gastos históricos como general/política.
 * Listo cuando hay que separar contabilidad después de un periodo mezclado.
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import BulkGastosNichoClient from "./BulkGastosNichoClient";

export const dynamic = "force-dynamic";

export default async function BulkGastosNichoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const { data } = await sb
    .from("gastos")
    .select("id, fecha, concepto, categoria, monto_usd, billetera, pagado_a, nicho")
    .order("fecha", { ascending: false })
    .range(0, 4999);

  return <BulkGastosNichoClient gastos={(data ?? []) as never[]} />;
}
