import { createServerClient } from "@/lib/supabase-server";
import type { IgMetrics } from "@/lib/types";

export async function fetchIgMetrics(): Promise<IgMetrics[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ig_metrics")
    .select("*")
    .order("fecha_inicio", { ascending: false });

  if (error) throw error;
  return (data ?? []) as IgMetrics[];
}

export async function fetchLatestIgMetrics(): Promise<IgMetrics | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ig_metrics")
    .select("*")
    .order("fecha_inicio", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as IgMetrics) ?? null;
}

export async function fetchIgMetricsPair(): Promise<{
  current: IgMetrics | null;
  previous: IgMetrics | null;
}> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ig_metrics")
    .select("*")
    .order("fecha_inicio", { ascending: false })
    .limit(2);

  if (error) throw error;
  const rows = (data ?? []) as IgMetrics[];
  return {
    current: rows[0] ?? null,
    previous: rows[1] ?? null,
  };
}

export async function createIgMetric(
  metric: Omit<IgMetrics, "id" | "created_at">
): Promise<IgMetrics> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ig_metrics")
    .insert(metric)
    .select()
    .single();

  if (error) throw error;
  return data as IgMetrics;
}
