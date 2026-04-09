import { createServerClient } from "@/lib/supabase-server";
import type { Client, Payment, TrackerSession, ClientFollowUp, RenewalHistory, SessionAvailability } from "@/lib/types";

export interface ClientWithRelations extends Client {
  payments: Payment[];
  sessions: TrackerSession[];
  follow_ups: ClientFollowUp[];
  renewals: RenewalHistory[];
  session_availability: SessionAvailability | null;
}

export async function fetchClients(): Promise<Client[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("[fetchClients]", error);
    return [];
  }
  return data as Client[];
}

export async function fetchClientById(id: string): Promise<ClientWithRelations | null> {
  const supabase = createServerClient();

  // Fetch client
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (clientErr || !client) {
    console.error("[fetchClientById]", clientErr);
    return null;
  }

  // Parallel fetch relations
  const [paymentsRes, sessionsRes, followUpsRes, renewalsRes, availRes] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .or(`client_id.eq.${id},lead_id.eq.${client.lead_id}`)
      .order("fecha_pago", { ascending: false }),
    supabase
      .from("tracker_sessions")
      .select("*")
      .eq("client_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("client_follow_ups")
      .select("*, author:team_members(id, nombre)")
      .eq("client_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("renewal_history")
      .select("*")
      .eq("client_id", id)
      .order("fecha_renovacion", { ascending: false }),
    supabase
      .from("v_session_availability")
      .select("*")
      .eq("client_id", id)
      .single(),
  ]);

  return {
    ...(client as Client),
    payments: (paymentsRes.data ?? []) as Payment[],
    sessions: (sessionsRes.data ?? []) as TrackerSession[],
    follow_ups: (followUpsRes.data ?? []) as ClientFollowUp[],
    renewals: (renewalsRes.data ?? []) as RenewalHistory[],
    session_availability: (availRes.data as SessionAvailability) ?? null,
  };
}

export async function updateClient(
  id: string,
  fields: Partial<Pick<Client,
    | "estado" | "estado_seguimiento" | "estado_contacto"
    | "semana_1_estado" | "semana_1_accionables"
    | "semana_2_estado" | "semana_2_accionables"
    | "semana_3_estado" | "semana_3_accionables"
    | "semana_4_estado" | "semana_4_accionables"
    | "notas_seguimiento" | "notas_conversacion"
    | "fecha_ultimo_seguimiento" | "fecha_proximo_seguimiento"
    | "facturacion_mes_1" | "facturacion_mes_2" | "facturacion_mes_3" | "facturacion_mes_4"
  >>
): Promise<Client | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[updateClient]", error);
    return null;
  }
  return data as Client;
}
