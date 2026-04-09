import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchClients } from "@/lib/queries/clients";
import { createServerClient } from "@/lib/supabase-server";
import SeguimientoClient from "./SeguimientoClient";
import type { SessionAvailability } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SeguimientoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const clients = await fetchClients();
  const activeClients = clients.filter((c) => c.estado === "activo");

  // Fetch session availability for all
  const supabase = createServerClient();
  const { data: availability } = await supabase
    .from("v_session_availability")
    .select("*");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Seguimiento de Alumnos</h1>
      <SeguimientoClient
        clients={activeClients}
        availability={(availability ?? []) as SessionAvailability[]}
        session={session}
      />
    </div>
  );
}
