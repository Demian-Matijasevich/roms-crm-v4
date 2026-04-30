import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import MetricasClientesClient from "./MetricasClientesClient";

export const dynamic = "force-dynamic";

export default async function MetricasClientesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const [clientsRes, renewalsRes] = await Promise.all([
    sb.from("clients").select("id, nombre, programa, estado, estado_contacto, fecha_onboarding, fecha_offboarding, total_dias_programa, exito, pesadilla, deudor_usd, notas_seguimiento").range(0, 4999),
    sb.from("renewal_history").select("id, client_id, tipo_renovacion, monto_total, estado, fecha_renovacion").range(0, 4999),
  ]);

  return (
    <MetricasClientesClient
      clients={(clientsRes.data ?? []) as ClientLite[]}
      renewals={(renewalsRes.data ?? []) as RenewalLite[]}
    />
  );
}

export interface ClientLite {
  id: string;
  nombre: string;
  programa: string | null;
  estado: string;
  estado_contacto: string;
  fecha_onboarding: string | null;
  fecha_offboarding: string | null;
  total_dias_programa: number;
  exito: boolean;
  pesadilla: boolean;
  deudor_usd: number;
  notas_seguimiento: string | null;
}

export interface RenewalLite {
  id: string;
  client_id: string;
  tipo_renovacion: string | null;
  monto_total: number;
  estado: string | null;
  fecha_renovacion: string | null;
}
