import { createServerClient } from "@/lib/supabase-server";
import type { TrackerSession, SessionAvailability } from "@/lib/types";

export async function fetchSessions(): Promise<TrackerSession[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tracker_sessions")
    .select("*, client:clients(id, nombre, programa)")
    .order("fecha", { ascending: false });

  if (error) {
    console.error("[fetchSessions]", error);
    return [];
  }
  return data as TrackerSession[];
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
