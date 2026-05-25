import { createServerClient } from "@/lib/supabase-server";
import type { Lead, TeamMember } from "@/lib/types";

export interface LeadWithTeam extends Omit<Lead, "setter" | "closer"> {
  setter: TeamMember | null;
  closer: TeamMember | null;
}

/**
 * Fetch leads with setter/closer joined, ordered by created_at desc.
 * Default limit 2000 — los más recientes son los relevantes para la UI.
 * Páginas viejas se acceden con limit/offset si hace falta.
 */
export async function fetchLeads(limit = 2000, offset = 0): Promise<LeadWithTeam[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[fetchLeads]", error.message);
    return [];
  }
  return (data ?? []) as LeadWithTeam[];
}

/**
 * Fetch a single lead by ID with setter/closer.
 */
export async function fetchLeadById(id: string): Promise<LeadWithTeam | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("[fetchLeadById]", error.message);
    return null;
  }
  return data as LeadWithTeam;
}

/**
 * Fetch leads filtered by closer_id (for non-admin closers).
 */
export async function fetchLeadsByCloser(closerId: string): Promise<LeadWithTeam[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .eq("closer_id", closerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchLeadsByCloser]", error.message);
    return [];
  }
  return (data ?? []) as LeadWithTeam[];
}

/**
 * Fetch leads filtered by setter_id (for non-admin setters).
 */
export async function fetchLeadsBySetter(setterId: string): Promise<LeadWithTeam[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .eq("setter_id", setterId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchLeadsBySetter]", error.message);
    return [];
  }
  return (data ?? []) as LeadWithTeam[];
}

/**
 * Update a lead by ID. Returns the updated lead.
 */
export async function updateLead(
  id: string,
  updates: Record<string, unknown>
): Promise<Lead | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[updateLead]", error.message, "updates:", JSON.stringify(updates));
    return null;
  }
  return data as Lead;
}

/**
 * Same as updateLead but exposes the DB error message instead of swallowing it.
 */
export async function updateLeadVerbose(
  id: string,
  updates: Record<string, unknown>
): Promise<{ ok: boolean; lead?: Lead; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[updateLeadVerbose]", error.message, "updates:", JSON.stringify(updates));
    return { ok: false, error: error.message };
  }
  return { ok: true, lead: data as Lead };
}

/**
 * Create a new lead. Returns the created lead.
 */
export async function createLead(
  lead: Omit<Lead, "id" | "created_at" | "updated_at" | "instagram_sin_arroba">
): Promise<Lead | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(lead)
    .select()
    .single();

  if (error) {
    console.error("[createLead]", error.message);
    return null;
  }
  return data as Lead;
}

/**
 * Fetch all team members (for filter dropdowns).
 */
export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) {
    console.error("[fetchTeamMembers]", error.message);
    return [];
  }
  return (data ?? []) as TeamMember[];
}
