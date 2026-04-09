import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString } from "@/lib/date-utils";
import type {
  Payment,
  AgentTask,
  RenewalQueueRow,
  AgentLog,
  PaymentEstado,
  MetodoPago,
} from "@/lib/types";

/** Unified queue item for the cobranzas page */
export interface CobranzasQueueItem {
  id: string;
  tipo: "cuota" | "renovacion" | "tarea_agente";
  client_id: string | null;
  client_nombre: string;
  client_telefono: string | null;
  client_canal: string | null;
  monto_usd: number;
  dias_vencido: number; // negative = overdue, positive = days remaining
  fecha_vencimiento: string | null;
  semaforo: "vencido" | "urgente" | "proximo" | "ok";
  estado_contacto: string | null;
  // Source-specific
  payment_id: string | null;
  payment_estado: PaymentEstado | null;
  numero_cuota: number | null;
  task_id: string | null;
  task_tipo: string | null;
  task_estado: string | null;
  task_asignado_a: string | null;
  task_prioridad: number;
  // For display
  programa: string | null;
  last_log: AgentLog | null;
}

/** Fetch pending/overdue cuotas */
async function fetchPendingPayments(): Promise<CobranzasQueueItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, monto_usd, fecha_vencimiento, estado, numero_cuota,
      client:clients(id, nombre, telefono, programa, estado_contacto, canal_contacto),
      lead:leads(id, nombre, telefono)
    `)
    .eq("estado", "pendiente")
    .order("fecha_vencimiento", { ascending: true });

  if (error) throw new Error(`fetchPendingPayments: ${error.message}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data ?? []).map((p: any) => {
    const venc = p.fecha_vencimiento ? new Date(p.fecha_vencimiento) : today;
    const diasDiff = Math.floor(
      (venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const nombre = p.client?.nombre ?? p.lead?.nombre ?? "Sin nombre";
    const telefono = p.client?.telefono ?? p.lead?.telefono ?? null;

    let semaforo: CobranzasQueueItem["semaforo"];
    if (diasDiff < 0) semaforo = "vencido";
    else if (diasDiff <= 7) semaforo = "urgente";
    else if (diasDiff <= 15) semaforo = "proximo";
    else semaforo = "ok";

    return {
      id: `payment-${p.id}`,
      tipo: "cuota" as const,
      client_id: p.client?.id ?? null,
      client_nombre: nombre,
      client_telefono: telefono,
      client_canal: p.client?.canal_contacto ?? null,
      monto_usd: p.monto_usd ?? 0,
      dias_vencido: diasDiff,
      fecha_vencimiento: p.fecha_vencimiento ?? null,
      semaforo,
      estado_contacto: p.client?.estado_contacto ?? null,
      payment_id: p.id,
      payment_estado: p.estado,
      numero_cuota: p.numero_cuota,
      task_id: null,
      task_tipo: null,
      task_estado: null,
      task_asignado_a: null,
      task_prioridad: diasDiff < 0 ? 1 : diasDiff <= 3 ? 2 : 3,
      programa: p.client?.programa ?? null,
      last_log: null,
    };
  });
}

/** Fetch renewal queue items with urgency */
async function fetchRenewalQueue(): Promise<CobranzasQueueItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("v_renewal_queue")
    .select("*")
    .in("semaforo", ["vencido", "urgente", "proximo"])
    .order("dias_restantes", { ascending: true });

  if (error) throw new Error(`fetchRenewalQueue: ${error.message}`);

  return (data ?? []).map((r: RenewalQueueRow) => ({
    id: `renewal-${r.id}`,
    tipo: "renovacion" as const,
    client_id: r.id,
    client_nombre: r.nombre,
    client_telefono: null,
    client_canal: null,
    monto_usd: 0,
    dias_vencido: r.dias_restantes,
    fecha_vencimiento: null,
    semaforo: r.semaforo as CobranzasQueueItem["semaforo"],
    estado_contacto: r.estado_contacto,
    payment_id: null,
    payment_estado: null,
    numero_cuota: null,
    task_id: null,
    task_tipo: "renovacion",
    task_estado: null,
    task_asignado_a: null,
    task_prioridad: r.semaforo === "vencido" ? 1 : r.semaforo === "urgente" ? 2 : 3,
    programa: r.programa,
    last_log: null,
  }));
}

/** Fetch active agent tasks (pending/in_progress) */
async function fetchActiveAgentTasks(): Promise<CobranzasQueueItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("agent_tasks")
    .select(`
      *,
      client:clients(id, nombre, telefono, programa, estado_contacto, canal_contacto),
      lead:leads(id, nombre, telefono)
    `)
    .in("estado", ["pending", "in_progress"])
    .order("prioridad", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`fetchActiveAgentTasks: ${error.message}`);

  // Fetch latest log entry for each task
  const taskIds = (data ?? []).map((t: any) => t.id);
  let logMap: Record<string, AgentLog> = {};
  if (taskIds.length > 0) {
    const { data: logs } = await supabase
      .from("agent_log")
      .select("*")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false });

    if (logs) {
      for (const log of logs as AgentLog[]) {
        if (!logMap[log.task_id]) {
          logMap[log.task_id] = log;
        }
      }
    }
  }

  return (data ?? []).map((t: any) => {
    const nombre = t.client?.nombre ?? t.lead?.nombre ?? "Sin nombre";
    const telefono = t.client?.telefono ?? t.lead?.telefono ?? null;

    return {
      id: `task-${t.id}`,
      tipo: "tarea_agente" as const,
      client_id: t.client_id,
      client_nombre: nombre,
      client_telefono: telefono,
      client_canal: t.client?.canal_contacto ?? t.canal,
      monto_usd: (t.contexto as any)?.monto_usd ?? 0,
      dias_vencido: (t.contexto as any)?.dias_vencido ?? 0,
      fecha_vencimiento: null,
      semaforo: t.prioridad <= 2 ? "vencido" as const : t.prioridad <= 3 ? "urgente" as const : "ok" as const,
      estado_contacto: t.client?.estado_contacto ?? null,
      payment_id: t.payment_id,
      payment_estado: null,
      numero_cuota: null,
      task_id: t.id,
      task_tipo: t.tipo,
      task_estado: t.estado,
      task_asignado_a: t.asignado_a,
      task_prioridad: t.prioridad,
      programa: t.client?.programa ?? null,
      last_log: logMap[t.id] ?? null,
    };
  });
}

/** Main function: combined, deduplicated, sorted queue */
export async function fetchCobranzasQueue(): Promise<CobranzasQueueItem[]> {
  const [payments, renewals, tasks] = await Promise.all([
    fetchPendingPayments(),
    fetchRenewalQueue(),
    fetchActiveAgentTasks(),
  ]);

  // Deduplicate: if a payment already has a matching agent task, keep only the task version
  const taskPaymentIds = new Set(
    tasks
      .filter((t) => t.payment_id)
      .map((t) => t.payment_id)
  );
  const filteredPayments = payments.filter(
    (p) => !taskPaymentIds.has(p.payment_id)
  );

  // Deduplicate renewals: if a renewal client already has an agent task of type 'renovacion', skip
  const taskRenewalClientIds = new Set(
    tasks
      .filter((t) => t.task_tipo === "renovacion" && t.client_id)
      .map((t) => t.client_id)
  );
  const filteredRenewals = renewals.filter(
    (r) => !taskRenewalClientIds.has(r.client_id)
  );

  const combined = [...filteredPayments, ...filteredRenewals, ...tasks];

  // Sort: vencido first, then by priority, then by amount desc
  combined.sort((a, b) => {
    const semaforoOrder = { vencido: 0, urgente: 1, proximo: 2, ok: 3 };
    const aDiff = semaforoOrder[a.semaforo] - semaforoOrder[b.semaforo];
    if (aDiff !== 0) return aDiff;
    const priDiff = a.task_prioridad - b.task_prioridad;
    if (priDiff !== 0) return priDiff;
    return b.monto_usd - a.monto_usd;
  });

  return combined;
}

/** Fetch ALL pendiente payments in the current fiscal period (8th to 7th) */
export async function fetchFiscalPendingPayments(): Promise<CobranzasQueueItem[]> {
  const supabase = createServerClient();
  const start = toDateString(getFiscalStart());
  const end = toDateString(getFiscalEnd());

  // Fetch payments in fiscal range OR with no vencimiento date (still need collecting)
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, monto_usd, fecha_vencimiento, estado, numero_cuota,
      client:clients(id, nombre, telefono, programa, estado_contacto, canal_contacto),
      lead:leads(id, nombre, telefono)
    `)
    .eq("estado", "pendiente")
    .or(`and(fecha_vencimiento.gte.${start},fecha_vencimiento.lte.${end}),fecha_vencimiento.is.null`)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`fetchFiscalPendingPayments: ${error.message}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data ?? []).map((p: any) => {
    const venc = p.fecha_vencimiento ? new Date(p.fecha_vencimiento + "T00:00:00") : today;
    const diasDiff = Math.floor(
      (venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const nombre = p.client?.nombre ?? p.lead?.nombre ?? "Sin nombre";
    const telefono = p.client?.telefono ?? p.lead?.telefono ?? null;

    let semaforo: CobranzasQueueItem["semaforo"];
    if (diasDiff < 0) semaforo = "vencido";
    else if (diasDiff <= 7) semaforo = "urgente";
    else if (diasDiff <= 15) semaforo = "proximo";
    else semaforo = "ok";

    return {
      id: `payment-${p.id}`,
      tipo: "cuota" as const,
      client_id: p.client?.id ?? null,
      client_nombre: nombre,
      client_telefono: telefono,
      client_canal: p.client?.canal_contacto ?? null,
      monto_usd: p.monto_usd ?? 0,
      dias_vencido: diasDiff,
      fecha_vencimiento: p.fecha_vencimiento,
      semaforo,
      estado_contacto: p.client?.estado_contacto ?? null,
      payment_id: p.id,
      payment_estado: p.estado,
      numero_cuota: p.numero_cuota,
      task_id: null,
      task_tipo: null,
      task_estado: null,
      task_asignado_a: null,
      task_prioridad: diasDiff < 0 ? 1 : diasDiff <= 3 ? 2 : 3,
      programa: p.client?.programa ?? null,
      last_log: null,
    };
  });
}

/** Fetch overdue payments from ANY period (vencimiento < today, still pendiente) */
export async function fetchOverduePayments(): Promise<CobranzasQueueItem[]> {
  const supabase = createServerClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateString(today);

  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, monto_usd, fecha_vencimiento, estado, numero_cuota,
      client:clients(id, nombre, telefono, programa, estado_contacto, canal_contacto),
      lead:leads(id, nombre, telefono)
    `)
    .eq("estado", "pendiente")
    .lt("fecha_vencimiento", todayStr)
    .order("fecha_vencimiento", { ascending: true });

  if (error) throw new Error(`fetchOverduePayments: ${error.message}`);

  return (data ?? []).map((p: any) => {
    const venc = p.fecha_vencimiento ? new Date(p.fecha_vencimiento + "T00:00:00") : today;
    const diasDiff = Math.floor(
      (venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const nombre = p.client?.nombre ?? p.lead?.nombre ?? "Sin nombre";
    const telefono = p.client?.telefono ?? p.lead?.telefono ?? null;

    return {
      id: `payment-${p.id}`,
      tipo: "cuota" as const,
      client_id: p.client?.id ?? null,
      client_nombre: nombre,
      client_telefono: telefono,
      client_canal: p.client?.canal_contacto ?? null,
      monto_usd: p.monto_usd ?? 0,
      dias_vencido: diasDiff,
      fecha_vencimiento: p.fecha_vencimiento,
      semaforo: "vencido" as const,
      estado_contacto: p.client?.estado_contacto ?? null,
      payment_id: p.id,
      payment_estado: p.estado,
      numero_cuota: p.numero_cuota,
      task_id: null,
      task_tipo: null,
      task_estado: null,
      task_asignado_a: null,
      task_prioridad: 1,
      programa: p.client?.programa ?? null,
      last_log: null,
    };
  });
}

/** Fetch pagado payments in the current fiscal period (for the "cobrado" KPI) */
export async function fetchFiscalPaidPayments(): Promise<{ total: number; count: number }> {
  const supabase = createServerClient();
  const start = toDateString(getFiscalStart());
  const end = toDateString(getFiscalEnd());

  const { data, error } = await supabase
    .from("payments")
    .select("monto_usd")
    .eq("estado", "pagado")
    .gte("fecha_pago", start)
    .lte("fecha_pago", end);

  if (error) throw new Error(`fetchFiscalPaidPayments: ${error.message}`);

  const items = data ?? [];
  return {
    total: items.reduce((sum: number, p: any) => sum + (p.monto_usd ?? 0), 0),
    count: items.length,
  };
}

/** Paid payment record for client-side fiscal filtering */
export interface PaidPaymentRecord {
  id: string;
  monto_usd: number;
  fecha_pago: string | null;
}

/** Fetch ALL paid payments (no date filter) — client filters by selected month */
export async function fetchAllPaidPayments(): Promise<PaidPaymentRecord[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("payments")
    .select("id, monto_usd, fecha_pago")
    .eq("estado", "pagado")
    .order("fecha_pago", { ascending: false });

  if (error) throw new Error(`fetchAllPaidPayments: ${error.message}`);

  return (data ?? []).map((p: any) => ({
    id: p.id,
    monto_usd: p.monto_usd ?? 0,
    fecha_pago: p.fecha_pago,
  }));
}

/** Fetch ALL pending payments (no date filter) as CobranzasQueueItem — client filters by selected month */
export async function fetchAllPendingPaymentsAsItems(): Promise<CobranzasQueueItem[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, monto_usd, fecha_vencimiento, estado, numero_cuota,
      client:clients(id, nombre, telefono, programa, estado_contacto, canal_contacto),
      lead:leads(id, nombre, telefono)
    `)
    .eq("estado", "pendiente")
    .order("fecha_vencimiento", { ascending: true });

  if (error) throw new Error(`fetchAllPendingPaymentsAsItems: ${error.message}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data ?? []).map((p: any) => {
    const venc = p.fecha_vencimiento ? new Date(p.fecha_vencimiento + "T00:00:00") : today;
    const diasDiff = Math.floor(
      (venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const nombre = p.client?.nombre ?? p.lead?.nombre ?? "Sin nombre";
    const telefono = p.client?.telefono ?? p.lead?.telefono ?? null;

    let semaforo: CobranzasQueueItem["semaforo"];
    if (diasDiff < 0) semaforo = "vencido";
    else if (diasDiff <= 7) semaforo = "urgente";
    else if (diasDiff <= 15) semaforo = "proximo";
    else semaforo = "ok";

    return {
      id: `payment-${p.id}`,
      tipo: "cuota" as const,
      client_id: p.client?.id ?? null,
      client_nombre: nombre,
      client_telefono: telefono,
      client_canal: p.client?.canal_contacto ?? null,
      monto_usd: p.monto_usd ?? 0,
      dias_vencido: diasDiff,
      fecha_vencimiento: p.fecha_vencimiento,
      semaforo,
      estado_contacto: p.client?.estado_contacto ?? null,
      payment_id: p.id,
      payment_estado: p.estado,
      numero_cuota: p.numero_cuota,
      task_id: null,
      task_tipo: null,
      task_estado: null,
      task_asignado_a: null,
      task_prioridad: diasDiff < 0 ? 1 : diasDiff <= 3 ? 2 : 3,
      programa: p.client?.programa ?? null,
      last_log: null,
    };
  });
}

// ========================================
// AUDIT TYPES & QUERIES
// ========================================

export interface AuditCuotaRow {
  id: string;
  client_nombre: string;
  numero_cuota: number;
  monto_usd: number;
  fecha_pago: string | null;
  receptor: string | null;
  cobrador_nombre: string | null;
  cobrador_id: string | null;
  metodo_pago: string | null;
  es_renovacion: boolean;
}

/** Fetch paid cuotas (numero_cuota > 1) with cobrador name */
export async function fetchAuditCuotas(): Promise<AuditCuotaRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, numero_cuota, monto_usd, fecha_pago, receptor, metodo_pago, cobrador_id, es_renovacion,
      client:clients(nombre),
      lead:leads(nombre),
      cobrador:team_members!payments_cobrador_id_fkey(nombre)
    `)
    .gt("numero_cuota", 1)
    .eq("estado", "pagado")
    .eq("es_renovacion", false)
    .order("fecha_pago", { ascending: false });

  if (error) throw new Error(`fetchAuditCuotas: ${error.message}`);

  return (data ?? []).map((p: any) => ({
    id: p.id,
    client_nombre: p.client?.nombre ?? p.lead?.nombre ?? "Sin nombre",
    numero_cuota: p.numero_cuota,
    monto_usd: p.monto_usd ?? 0,
    fecha_pago: p.fecha_pago,
    receptor: p.receptor,
    cobrador_nombre: p.cobrador?.nombre ?? null,
    cobrador_id: p.cobrador_id,
    metodo_pago: p.metodo_pago,
    es_renovacion: p.es_renovacion,
  }));
}

/** Fetch paid renovaciones */
export async function fetchAuditRenovaciones(): Promise<AuditCuotaRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select(`
      id, numero_cuota, monto_usd, fecha_pago, receptor, metodo_pago, cobrador_id, es_renovacion,
      client:clients(nombre),
      lead:leads(nombre),
      cobrador:team_members!payments_cobrador_id_fkey(nombre)
    `)
    .eq("es_renovacion", true)
    .eq("estado", "pagado")
    .order("fecha_pago", { ascending: false });

  if (error) throw new Error(`fetchAuditRenovaciones: ${error.message}`);

  return (data ?? []).map((p: any) => ({
    id: p.id,
    client_nombre: p.client?.nombre ?? p.lead?.nombre ?? "Sin nombre",
    numero_cuota: p.numero_cuota,
    monto_usd: p.monto_usd ?? 0,
    fecha_pago: p.fecha_pago,
    receptor: p.receptor,
    cobrador_nombre: p.cobrador?.nombre ?? null,
    cobrador_id: p.cobrador_id,
    metodo_pago: p.metodo_pago,
    es_renovacion: p.es_renovacion,
  }));
}

/** Mark a payment as paid */
export async function markPaymentPaid(
  paymentId: string,
  data: {
    monto_usd: number;
    monto_ars?: number;
    metodo_pago: MetodoPago;
    receptor: string;
    cobrador_id: string;
    comprobante_url?: string;
  }
): Promise<Payment> {
  const supabase = createServerClient();
  const { data: updated, error } = await supabase
    .from("payments")
    .update({
      estado: "pagado" as PaymentEstado,
      fecha_pago: new Date().toISOString().split("T")[0],
      monto_usd: data.monto_usd,
      monto_ars: data.monto_ars ?? 0,
      metodo_pago: data.metodo_pago,
      receptor: data.receptor,
      cobrador_id: data.cobrador_id,
      comprobante_url: data.comprobante_url ?? null,
    })
    .eq("id", paymentId)
    .select()
    .single();

  if (error) throw new Error(`markPaymentPaid: ${error.message}`);
  return updated as Payment;
}

/** Mark an agent task as done */
export async function markTaskDone(
  taskId: string,
  resultado?: string
): Promise<AgentTask> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("agent_tasks")
    .update({
      estado: "done",
      completed_at: new Date().toISOString(),
      resultado: resultado ?? "Completado manualmente",
    })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw new Error(`markTaskDone: ${error.message}`);
  return data as AgentTask;
}
