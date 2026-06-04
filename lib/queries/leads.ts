import { createServerClient } from "@/lib/supabase-server";
import { getNichoFilter } from "@/lib/vista";
import type { Lead, TeamMember } from "@/lib/types";

export interface LeadWithTeam extends Omit<Lead, "setter" | "closer"> {
  setter: TeamMember | null;
  closer: TeamMember | null;
}

/**
 * Filtro de nicho automático según la vista del usuario.
 * Si `opts.skipNichoFilter=true` se ignora (útil para admin / scripts).
 */
type NichoOpt = { skipNichoFilter?: boolean };

/**
 * Fetch leads con filtro automático por nicho según vista.
 * Default limit 2000 — los más recientes son los relevantes para la UI.
 */
export async function fetchLeads(limit = 2000, offset = 0, opts: NichoOpt = {}): Promise<LeadWithTeam[]> {
  const supabase = createServerClient();
  const nicho = opts.skipNichoFilter ? null : await getNichoFilter();
  let q = supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (nicho) q = q.eq("nicho", nicho);

  const { data, error } = await q;
  if (error) {
    console.error("[fetchLeads]", error.message);
    return [];
  }
  return (data ?? []) as LeadWithTeam[];
}

/**
 * Fetch un lead por id (sin filtro de nicho — solo controla acceso por id).
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
 * Aplica filtro de nicho.
 */
export async function fetchLeadsByCloser(closerId: string, opts: NichoOpt = {}): Promise<LeadWithTeam[]> {
  const supabase = createServerClient();
  const nicho = opts.skipNichoFilter ? null : await getNichoFilter();
  let q = supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .eq("closer_id", closerId)
    .order("created_at", { ascending: false });
  if (nicho) q = q.eq("nicho", nicho);

  const { data, error } = await q;
  if (error) {
    console.error("[fetchLeadsByCloser]", error.message);
    return [];
  }
  return (data ?? []) as LeadWithTeam[];
}

/**
 * Fetch leads filtered by setter_id (for non-admin setters).
 * Aplica filtro de nicho.
 */
export async function fetchLeadsBySetter(setterId: string, opts: NichoOpt = {}): Promise<LeadWithTeam[]> {
  const supabase = createServerClient();
  const nicho = opts.skipNichoFilter ? null : await getNichoFilter();
  let q = supabase
    .from("leads")
    .select(`
      *,
      setter:team_members!leads_setter_id_fkey(*),
      closer:team_members!leads_closer_id_fkey(*)
    `)
    .eq("setter_id", setterId)
    .order("created_at", { ascending: false });
  if (nicho) q = q.eq("nicho", nicho);

  const { data, error } = await q;
  if (error) {
    console.error("[fetchLeadsBySetter]", error.message);
    return [];
  }
  return (data ?? []) as LeadWithTeam[];
}

/**
 * Helper interno: devuelve el Set de leadIds del nicho actual.
 * Null si vista=todos (sin filtro).
 */
export async function getNichoLeadIds(): Promise<Set<string> | null> {
  const nicho = await getNichoFilter();
  if (!nicho) return null;
  const sb = createServerClient();
  const { data } = await sb.from("leads").select("id").eq("nicho", nicho).range(0, 19999);
  return new Set((data || []).map((l) => l.id));
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
