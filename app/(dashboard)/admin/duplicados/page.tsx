import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { detectDuplicates, type LeadForDup } from "@/lib/dup-detect";
import DuplicadosClient from "./DuplicadosClient";

export const dynamic = "force-dynamic";

export default async function DuplicadosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.is_admin) redirect("/");

  const sb = createServerClient();
  const { data } = await sb
    .from("leads")
    .select("id, nombre, telefono_normalizado, telefono, email, instagram, created_at, estado, ticket_total, closer_id, closer:team_members!leads_closer_id_fkey(nombre)")
    .range(0, 9999);

  const leadsForDup: LeadForDup[] = (data || []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    nombre: (l.nombre as string) || null,
    telefono_normalizado: (l.telefono_normalizado as string) || null,
    email: (l.email as string) || null,
    instagram: (l.instagram as string) || null,
    created_at: (l.created_at as string) || undefined,
  }));

  const groups = detectDuplicates(leadsForDup);

  // Enriquecer con datos extra
  const leadById = new Map((data || []).map((l: Record<string, unknown>) => [l.id as string, l]));
  const enriched = groups.map((g) => ({
    ...g,
    leads: g.leads.map((l) => {
      const full = leadById.get(l.id) || {};
      const closerData = (full as { closer?: { nombre?: string } | { nombre?: string }[] }).closer;
      const closerNombre = Array.isArray(closerData) ? closerData[0]?.nombre : closerData?.nombre;
      return {
        ...l,
        telefono: (full as { telefono?: string }).telefono || null,
        estado: (full as { estado?: string }).estado || null,
        ticket_total: Number((full as { ticket_total?: number }).ticket_total || 0),
        closer_nombre: closerNombre || null,
      };
    }),
  }));

  return <DuplicadosClient groups={enriched} />;
}
