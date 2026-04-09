import { createServerClient } from "@/lib/supabase-server";
import type { ClientFollowUp } from "@/lib/types";

export interface FollowUpWithAuthor extends ClientFollowUp {
  author?: { id: string; nombre: string };
}

export async function fetchFollowUpsByClient(clientId: string): Promise<FollowUpWithAuthor[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("client_follow_ups")
    .select("*, author:team_members(id, nombre)")
    .eq("client_id", clientId)
    .order("fecha", { ascending: false });

  if (error) {
    console.error("[fetchFollowUpsByClient]", error);
    return [];
  }
  return data as FollowUpWithAuthor[];
}

export async function createFollowUp(
  followUp: Omit<ClientFollowUp, "id" | "created_at">
): Promise<ClientFollowUp | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("client_follow_ups")
    .insert(followUp)
    .select()
    .single();

  if (error) {
    console.error("[createFollowUp]", error);
    return null;
  }
  return data as ClientFollowUp;
}
