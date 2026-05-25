import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import ProspectosClient from "./ProspectosClient";

export const dynamic = "force-dynamic";

export interface ProspectoRow {
  id: string;
  nombre: string | null;
  telefono: string;
  instagram: string | null;
  email: string | null;
  origen: string | null;
  notas: string | null;
  etiquetas: string[];
  estado: "nuevo" | "intentado" | "respondio" | "agendado" | "descartado";
  asignado_a: string | null;
  asignado_nombre: string | null;
  creado_por: string | null;
  convertido_lead_id: string | null;
  fecha_ultimo_contacto: string | null;
  fecha_proximo_seguimiento: string | null;
  created_at: string;
}

export interface TeamMemberRow {
  id: string;
  nombre: string;
  is_admin: boolean;
}

export default async function ProspectosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const sb = createServerClient();

  const [prospectosRes, teamRes] = await Promise.all([
    sb.from("prospectos")
      .select("id, nombre, telefono, instagram, email, origen, notas, etiquetas, estado, asignado_a, creado_por, convertido_lead_id, fecha_ultimo_contacto, fecha_proximo_seguimiento, created_at")
      .order("created_at", { ascending: false })
      .range(0, 4999),
    sb.from("team_members")
      .select("id, nombre, is_admin")
      .eq("activo", true)
      .order("nombre"),
  ]);

  const team = (teamRes.data ?? []) as TeamMemberRow[];
  const teamById = new Map(team.map((t) => [t.id, t.nombre]));

  const prospectos: ProspectoRow[] = ((prospectosRes.data ?? []) as Array<Omit<ProspectoRow, "asignado_nombre">>).map((p) => ({
    ...p,
    asignado_nombre: p.asignado_a ? teamById.get(p.asignado_a) || null : null,
  }));

  return (
    <ProspectosClient
      prospectos={prospectos}
      team={team}
      session={session}
    />
  );
}
