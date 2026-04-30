import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import MelUpdateClient from "./MelUpdateClient";

export const dynamic = "force-dynamic";

export default async function MelUpdatePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin && !session.roles.includes("cobranzas")) redirect("/");

  const sb = createServerClient();
  const { data: clientsRes } = await sb
    .from("clients")
    .select("id, nombre, programa, estado, estado_contacto, fecha_onboarding, fecha_offboarding, total_dias_programa, exito, pesadilla, deudor_usd, notas_seguimiento")
    .order("fecha_onboarding", { ascending: false, nullsFirst: false })
    .range(0, 999);

  return <MelUpdateClient clients={clientsRes ?? []} />;
}
