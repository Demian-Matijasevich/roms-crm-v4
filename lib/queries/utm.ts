import { createServerClient } from "@/lib/supabase-server";
import type { TeamMember } from "@/lib/types";

export interface UtmCampaign {
  id: string;
  url: string | null;
  source: string | null;
  medium: string | null;
  content: string | null;
  setter_id: string | null;
  created_at: string;
  setter?: Pick<TeamMember, "id" | "nombre">;
}

export interface UtmCampaignWithPerformance extends UtmCampaign {
  agendas_count: number;
  facturacion: number;
  cash_collected: number;
}

export async function fetchUtmCampaigns(): Promise<UtmCampaignWithPerformance[]> {
  const supabase = createServerClient();

  // Fetch UTM campaigns with setter
  const { data: campaigns, error: campError } = await supabase
    .from("utm_campaigns")
    .select("*, setter:team_members!setter_id(id, nombre)")
    .order("created_at", { ascending: false });

  if (campError) throw campError;

  // Fetch leads with UTM data for performance matching
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, utm_source, utm_medium, utm_content, estado, ticket_total")
    .not("utm_source", "is", null);

  if (leadsError) throw leadsError;

  // Fetch payments for cash calculation
  const { data: payments, error: payError } = await supabase
    .from("payments")
    .select("lead_id, monto_usd, estado")
    .eq("estado", "pagado");

  if (payError) throw payError;

  // Build payment cash map by lead_id
  const cashByLead = new Map<string, number>();
  for (const p of payments ?? []) {
    if (p.lead_id) {
      cashByLead.set(p.lead_id, (cashByLead.get(p.lead_id) || 0) + p.monto_usd);
    }
  }

  // Match UTM campaigns to leads by source+medium+content
  const result: UtmCampaignWithPerformance[] = (campaigns ?? []).map((c) => {
    const matchingLeads = (leads ?? []).filter(
      (l) =>
        l.utm_source === c.source &&
        l.utm_medium === c.medium &&
        l.utm_content === c.content
    );

    const agendas_count = matchingLeads.length;
    const facturacion = matchingLeads
      .filter((l) => l.estado === "cerrado")
      .reduce((sum, l) => sum + (l.ticket_total || 0), 0);
    const cash_collected = matchingLeads.reduce(
      (sum, l) => sum + (cashByLead.get(l.id) || 0),
      0
    );

    return {
      ...c,
      agendas_count,
      facturacion,
      cash_collected,
    } as UtmCampaignWithPerformance;
  });

  return result;
}

export async function createUtmCampaign(data: {
  url: string;
  source: string;
  medium: string;
  content: string;
  setter_id: string | null;
}): Promise<UtmCampaign> {
  const supabase = createServerClient();
  const { data: campaign, error } = await supabase
    .from("utm_campaigns")
    .insert(data)
    .select("*, setter:team_members!setter_id(id, nombre)")
    .single();

  if (error) throw error;
  return campaign as UtmCampaign;
}
