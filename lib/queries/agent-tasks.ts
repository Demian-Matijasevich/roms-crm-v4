import { createServerClient } from "@/lib/supabase-server";
import type { AgentTask, AgentLog, AgentTaskTipo, AgentTaskEstado } from "@/lib/types";

export interface AgentTaskFilters {
  tipo?: AgentTaskTipo;
  estado?: AgentTaskEstado;
  asignado_a?: "agent" | "human";
  client_id?: string;
  prioridad_max?: number; // 1-5, returns tasks with prioridad <= this
}

export async function fetchAgentTasks(
  filters: AgentTaskFilters = {}
): Promise<AgentTask[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("agent_tasks")
    .select("*, client:clients(id, nombre, telefono, programa, estado_contacto, canal_contacto, health_score), lead:leads(id, nombre, telefono, instagram)")
    .order("prioridad", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  if (filters.estado) query = query.eq("estado", filters.estado);
  if (filters.asignado_a) query = query.eq("asignado_a", filters.asignado_a);
  if (filters.client_id) query = query.eq("client_id", filters.client_id);
  if (filters.prioridad_max) query = query.lte("prioridad", filters.prioridad_max);

  const { data, error } = await query;
  if (error) throw new Error(`fetchAgentTasks: ${error.message}`);
  return (data ?? []) as AgentTask[];
}

export async function createAgentTask(
  task: Omit<AgentTask, "id" | "created_at" | "completed_at">
): Promise<AgentTask> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("agent_tasks")
    .insert(task)
    .select()
    .single();

  if (error) throw new Error(`createAgentTask: ${error.message}`);
  return data as AgentTask;
}

export async function updateAgentTask(
  id: string,
  updates: Partial<Pick<AgentTask, "estado" | "prioridad" | "resultado" | "notas" | "completed_at" | "asignado_a" | "human_assignee_id">>
): Promise<AgentTask> {
  const supabase = createServerClient();

  // Auto-set completed_at when marking done/failed
  if ((updates.estado === "done" || updates.estado === "failed") && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("agent_tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateAgentTask: ${error.message}`);
  return data as AgentTask;
}

export async function fetchAgentLog(
  taskId?: string,
  limit = 50
): Promise<AgentLog[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("agent_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (taskId) query = query.eq("task_id", taskId);

  const { data, error } = await query;
  if (error) throw new Error(`fetchAgentLog: ${error.message}`);
  return (data ?? []) as AgentLog[];
}

export async function createAgentLogEntry(
  entry: Omit<AgentLog, "id" | "created_at">
): Promise<AgentLog> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("agent_log")
    .insert(entry)
    .select()
    .single();

  if (error) throw new Error(`createAgentLogEntry: ${error.message}`);
  return data as AgentLog;
}

/** Check if an active task already exists for a client+tipo combo */
export async function hasActiveTask(
  clientId: string,
  tipo: AgentTaskTipo
): Promise<boolean> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("agent_tasks")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("tipo", tipo)
    .not("estado", "in", '("done","failed")');

  if (error) throw new Error(`hasActiveTask: ${error.message}`);
  return (count ?? 0) > 0;
}
