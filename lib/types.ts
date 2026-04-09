// ========================================
// ENUMS (mirror Supabase enums)
// ========================================

export type LeadFuente =
  | "historias" | "lead_magnet" | "youtube" | "instagram" | "dm_directo"
  | "historia_cta" | "historia_hr" | "comentario_manychat" | "encuesta"
  | "why_now" | "win" | "fup" | "whatsapp" | "otro";

export type LeadEstado =
  | "pendiente" | "no_show" | "cancelada" | "reprogramada" | "seguimiento"
  | "no_calificado" | "no_cierre" | "reserva" | "cerrado"
  | "adentro_seguimiento" | "broke_cancelado";

export type LeadCalificacion = "calificado" | "no_calificado" | "podria";
export type LeadScore = "A" | "B" | "C" | "D";

export type Programa =
  | "roms_7" | "consultoria" | "omnipresencia" | "multicuentas";

export type ConceptoPago = "pif" | "fee" | "primera_cuota" | "segunda_cuota";
export type PlanPago = "paid_in_full" | "2_cuotas" | "3_cuotas" | "personalizado";
export type PaymentEstado = "pendiente" | "pagado" | "perdido" | "refund";

export type MetodoPago =
  | "mercado_pago" | "transferencia" | "cash" | "binance" | "stripe" | "wise";

export type ClientEstado = "activo" | "pausado" | "inactivo" | "solo_skool" | "no_termino_pagar";
export type SemanaEstado = "primeras_publicaciones" | "primera_venta" | "escalando_anuncios";
export type SeguimientoEstado = "para_seguimiento" | "no_necesita" | "seguimiento_urgente";

export type ContactoEstado =
  | "por_contactar" | "contactado" | "respondio_renueva" | "respondio_debe_cuota"
  | "es_socio" | "no_renueva" | "no_responde" | "numero_invalido"
  | "retirar_acceso" | "verificar";

export type TipoRenovacion =
  | "resell" | "upsell_vip" | "upsell_meli"
  | "upsell_vip_cuotas" | "upsell_meli_cuotas" | "resell_cuotas";

export type RenovacionEstado = "pago" | "no_renueva" | "cuota_1_pagada" | "cuota_2_pagada";
export type SessionTipo = "estrategia_inicial" | "revision_ajuste" | "cierre_ciclo" | "adicional";
export type SessionEstado = "programada" | "done" | "cancelada_no_asistio";
export type AgentTaskTipo = "cobrar_cuota" | "renovacion" | "seguimiento" | "oportunidad_upsell" | "bienvenida" | "seguimiento_urgente" | "confirmar_pago";
export type AgentTaskEstado = "pending" | "in_progress" | "done" | "failed";
export type FollowUpTipo = "llamada" | "whatsapp" | "dm" | "email" | "presencial";

// ========================================
// ROW TYPES
// ========================================

export interface TeamMember {
  id: string;
  user_id: string | null;
  nombre: string;
  etiqueta: string | null;
  rol: string | null;
  email: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  foto_url: string | null;
  observaciones: string | null;
  is_admin: boolean;
  is_closer: boolean;
  is_setter: boolean;
  is_cobranzas: boolean;
  is_seguimiento: boolean;
  comision_pct: number;
  pin: string | null;
  activo: boolean;
}

export interface Lead {
  id: string;
  sheets_row_index: number | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
  instagram_sin_arroba: string | null;
  fuente: LeadFuente | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  evento_calendly: string | null;
  calendly_event_id: string | null;
  fecha_agendado: string | null;
  fecha_llamada: string | null;
  estado: LeadEstado;
  setter_id: string | null;
  closer_id: string | null;
  cobrador_id: string | null;
  contexto_setter: string | null;
  reporte_general: string | null;
  notas_internas: string | null;
  experiencia_ecommerce: string | null;
  seguridad_inversion: string | null;
  tipo_productos: string | null;
  compromiso_asistencia: string | null;
  dispuesto_invertir: string | null;
  decisor: string | null;
  lead_calificado: LeadCalificacion | null;
  lead_score: LeadScore | null;
  link_llamada: string | null;
  programa_pitcheado: Programa | null;
  concepto: ConceptoPago | null;
  plan_pago: PlanPago | null;
  ticket_total: number;
  fue_seguimiento: boolean;
  de_donde_viene_lead: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  setter?: TeamMember;
  closer?: TeamMember;
}

export interface Payment {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  renewal_id: string | null;
  numero_cuota: number;
  monto_usd: number;
  monto_ars: number;
  fecha_pago: string | null;
  fecha_vencimiento: string | null;
  estado: PaymentEstado;
  metodo_pago: MetodoPago | null;
  receptor: string | null;
  comprobante_url: string | null;
  cobrador_id: string | null;
  verificado: boolean;
  es_renovacion: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  lead_id: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  programa: Programa | null;
  estado: ClientEstado;
  fecha_onboarding: string | null;
  fecha_offboarding: string | null;
  total_dias_programa: number;
  llamadas_base: number;
  pesadilla: boolean;
  exito: boolean;
  discord: boolean;
  skool: boolean;
  win_discord: boolean;
  semana_1_estado: SemanaEstado | null;
  semana_1_accionables: string | null;
  semana_2_estado: SemanaEstado | null;
  semana_2_accionables: string | null;
  semana_3_estado: SemanaEstado | null;
  semana_3_accionables: string | null;
  semana_4_estado: SemanaEstado | null;
  semana_4_accionables: string | null;
  facturacion_mes_1: string | null;
  facturacion_mes_2: string | null;
  facturacion_mes_3: string | null;
  facturacion_mes_4: string | null;
  estado_seguimiento: SeguimientoEstado;
  fecha_ultimo_seguimiento: string | null;
  fecha_proximo_seguimiento: string | null;
  notas_seguimiento: string | null;
  notas_conversacion: string | null;
  estado_contacto: ContactoEstado;
  responsable_renovacion: string | null;
  origen: string | null;
  canal_contacto: string | null;
  prioridad_contacto: string | null;
  categoria: string | null;
  email_skool: string | null;
  en_wa_esa: boolean;
  en_ig_grupo: boolean;
  deudor_usd: number;
  deudor_vencimiento: string | null;
  health_score: number;
  created_at: string;
  updated_at: string;
}

export interface TrackerSession {
  id: string;
  client_id: string;
  fecha: string | null;
  numero_sesion: number;
  tipo_sesion: SessionTipo;
  estado: SessionEstado;
  enlace_llamada: string | null;
  assignee_id: string | null;
  notas_setup: string | null;
  pitch_upsell: boolean;
  rating: number | null;
  aprendizaje_principal: string | null;
  feedback_cliente: string | null;
  herramienta_mas_util: string | null;
  action_items: Record<string, unknown>[];
  follow_up_date: string | null;
  created_at: string;
}

export interface DailyReport {
  id: string;
  setter_id: string;
  fecha: string;
  conversaciones_iniciadas: number;
  respuestas_historias: number;
  calendarios_enviados: number;
  ventas_por_chat: string | null;
  conversaciones_lead_inicio: string | null;
  agendas_confirmadas: string | null;
  origen_principal: string[];
  created_at: string;
}

export interface AgentTask {
  id: string;
  tipo: AgentTaskTipo;
  client_id: string | null;
  lead_id: string | null;
  payment_id: string | null;
  prioridad: number;
  estado: AgentTaskEstado;
  asignado_a: "agent" | "human";
  human_assignee_id: string | null;
  canal: "whatsapp" | "email" | "dm_instagram";
  contexto: Record<string, unknown>;
  scheduled_at: string;
  completed_at: string | null;
  resultado: string | null;
  notas: string | null;
  created_at: string;
}

export interface AgentLog {
  id: string;
  task_id: string;
  accion: string;
  mensaje_enviado: string | null;
  respuesta_recibida: string | null;
  resultado: string | null;
  created_at: string;
}

export interface ClientFollowUp {
  id: string;
  client_id: string;
  author_id: string;
  fecha: string;
  tipo: FollowUpTipo;
  notas: string | null;
  proxima_accion: string | null;
  proxima_fecha: string | null;
  created_at: string;
}

export interface RenewalHistory {
  id: string;
  client_id: string;
  tipo_renovacion: TipoRenovacion | null;
  programa_anterior: Programa | null;
  programa_nuevo: Programa | null;
  monto_total: number;
  plan_pago: PlanPago | null;
  estado: RenovacionEstado | null;
  fecha_renovacion: string | null;
  comprobante_url: string | null;
  responsable_id: string | null;
  created_at: string;
}

export interface IgMetrics {
  id: string;
  periodo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  cuentas_alcanzadas: number;
  impresiones: number;
  visitas_perfil: number;
  toques_enlaces: number;
  nuevos_seguidores: number;
  unfollows: number;
  total_seguidores: number;
  total_interacciones: number;
  reels_publicados: number;
  interacciones_reels: number;
  likes_reels: number;
  comentarios_reels: number;
  compartidos_reels: number;
  guardados_reels: number;
  leads_ig: number;
  ventas_ig: number;
  cash_ig: number;
  created_at: string;
  // Deltas and other fields omitted for brevity — added as needed
  [key: string]: unknown;
}

// ========================================
// VIEW TYPES
// ========================================

export interface MonthlyCash {
  mes_fiscal: string;
  cash_ventas_nuevas: number;
  cash_renovaciones: number;
  cash_cuotas: number;
  cash_total: number;
  refunds: number;
  facturacion: number;
  ventas_nuevas_count: number;
  renovaciones_count: number;
  saldo_pendiente_30d: number;
}

export interface TreasuryRow {
  receptor: string;
  mes_fiscal: string;
  metodo_pago: MetodoPago | null;
  total_usd: number;
  total_ars: number;
  num_pagos: number;
  usd_ventas_nuevas: number;
  usd_cuotas: number;
  usd_renovaciones: number;
}

export interface RenewalQueueRow {
  id: string;
  nombre: string;
  programa: Programa;
  fecha_onboarding: string;
  total_dias_programa: number;
  fecha_vencimiento: string;
  dias_restantes: number;
  estado_contacto: ContactoEstado;
  health_score: number;
  semaforo: "vencido" | "urgente" | "proximo" | "ok";
}

export interface SessionAvailability {
  client_id: string;
  nombre: string;
  programa: Programa;
  llamadas_base: number;
  sesiones_consumidas: number;
  sesiones_disponibles: number;
  semaforo: "agotadas" | "ultima" | "disponible";
  rating_promedio: number | null;
}

export interface Commission {
  team_member_id: string;
  nombre: string;
  mes_fiscal: string;
  comision_closer: number;
  comision_setter: number;
  comision_total: number;
}

// Commissions are now calculated from DB views only (no Airtable)
export interface AtCommission {
  id: string;
  nombre: string;
  comision_closer: number;
  comision_setter: number;
  comision_total: number;
}

export interface CloserKPI {
  team_member_id: string;
  nombre: string;
  mes_fiscal: string;
  total_agendas: number;
  presentadas: number;
  calificadas: number;
  cerradas: number;
  show_up_pct: number;
  cierre_pct: number;
  aov: number;
}

// ========================================
// CLIENT NOTES
// ========================================

export interface ClientNote {
  id: string;
  client_id: string;
  author_id: string;
  content: string;
  pinned: boolean;
  created_at: string;
  author?: { nombre: string };
}

// ========================================
// AUTH
// ========================================

export interface AuthSession {
  team_member_id: string;
  nombre: string;
  roles: string[];
  is_admin: boolean;
}

// ========================================
// UI HELPERS
// ========================================

export type Semaforo = "verde" | "amarillo" | "rojo";

export function healthToSemaforo(score: number): Semaforo {
  if (score >= 80) return "verde";
  if (score >= 50) return "amarillo";
  return "rojo";
}
