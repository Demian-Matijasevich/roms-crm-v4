import { createServerClient } from "@/lib/supabase-server";
import { getNichoLeadIds } from "@/lib/queries/leads";
import type { TrackerSession, SessionAvailability } from "@/lib/types";

type NichoOpt = { skipNichoFilter?: boolean };

export async function fetchSessions(opts: NichoOpt = {}): Promise<TrackerSession[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tracker_sessions")
    .select("*, client:clients(id, nombre, programa, lead_id)")
    .order("fecha", { ascending: false });

  if (error) {
    console.error("[fetchSessions]", error);
    return [];
  }
  const all = (data ?? []) as TrackerSession[];
  if (opts.skipNichoFilter) return all;
  const leadIds = await getNichoLeadIds();
  if (!leadIds) return all;
  return all.filter((s) => {
    const lid = (s as unknown as { client?: { lead_id?: string } }).client?.lead_id;
    return lid && leadIds.has(lid);
  });
}

export async function fetchSessionsByClient(clientId: string): Promise<TrackerSession[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tracker_sessions")
    .select("*")
    .eq("client_id", clientId)
    .order("fecha", { ascending: false });

  if (error) {
    console.error("[fetchSessionsByClient]", error);
    return [];
  }
  return data as TrackerSession[];
}

export async function fetchSessionAvailability(): Promise<SessionAvailability[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("v_session_availability")
    .select("*")
    .order("sesiones_disponibles", { ascending: true });

  if (error) {
    console.error("[fetchSessionAvailability]", error);
    return [];
  }
  return data as SessionAvailability[];
}

export async function createSession(
  session: Omit<TrackerSession, "id" | "created_at">
): Promise<TrackerSession | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tracker_sessions")
    .insert(session)
    .select()
    .single();

  if (error) {
    console.error("[createSession]", error);
    return null;
  }
  return data as TrackerSession;
}

export async function updateSession(
  id: string,
  fields: Partial<Omit<TrackerSession, "id" | "created_at">>
): Promise<TrackerSession | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tracker_sessions")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[updateSession]", error);
    return null;
  }
  return data as TrackerSession;
}
