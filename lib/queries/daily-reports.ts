import { createServerClient } from "@/lib/supabase-server";
import type { DailyReport, TeamMember } from "@/lib/types";
import { getFiscalStart, getFiscalEnd } from "@/lib/date-utils";

export interface DailyReportWithSetter extends DailyReport {
  setter?: Pick<TeamMember, "id" | "nombre">;
}

export async function fetchDailyReports(filters?: {
  setterId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<DailyReportWithSetter[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("daily_reports")
    .select("*, setter:team_members!setter_id(id, nombre)")
    .order("fecha", { ascending: false });

  if (filters?.setterId) {
    query = query.eq("setter_id", filters.setterId);
  }
  if (filters?.dateFrom) {
    query = query.gte("fecha", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("fecha", filters.dateTo);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DailyReportWithSetter[];
}

export interface SetterAggregates {
  setter_id: string;
  setter_nombre: string;
  total_conversaciones: number;
  total_respuestas_historias: number;
  total_calendarios: number;
  total_agendas: string[];
  report_count: number;
}

export async function fetchReportsByMember(
  fiscalStart?: Date,
  fiscalEnd?: Date
): Promise<SetterAggregates[]> {
  const start = fiscalStart || getFiscalStart();
  const end = fiscalEnd || getFiscalEnd();

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("*, setter:team_members!setter_id(id, nombre)")
    .gte("fecha", start.toISOString().split("T")[0])
    .lte("fecha", end.toISOString().split("T")[0])
    .order("fecha", { ascending: false });

  if (error) throw error;

  const reports = (data ?? []) as DailyReportWithSetter[];

  // Aggregate by setter
  const map = new Map<string, SetterAggregates>();
  for (const r of reports) {
    const id = r.setter_id;
    const existing = map.get(id);
    if (existing) {
      existing.total_conversaciones += r.conversaciones_iniciadas;
      existing.total_respuestas_historias += r.respuestas_historias;
      existing.total_calendarios += r.calendarios_enviados;
      if (r.agendas_confirmadas) existing.total_agendas.push(r.agendas_confirmadas);
      existing.report_count++;
    } else {
      map.set(id, {
        setter_id: id,
        setter_nombre: r.setter?.nombre ?? "\u2014",
        total_conversaciones: r.conversaciones_iniciadas,
        total_respuestas_historias: r.respuestas_historias,
        total_calendarios: r.calendarios_enviados,
        total_agendas: r.agendas_confirmadas ? [r.agendas_confirmadas] : [],
        report_count: 1,
      });
    }
  }

  return Array.from(map.values());
}

export async function fetchSetters(): Promise<Pick<TeamMember, "id" | "nombre">[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("id, nombre")
    .eq("is_setter", true)
    .eq("activo", true);

  if (error) throw error;
  return (data ?? []) as Pick<TeamMember, "id" | "nombre">[];
}
