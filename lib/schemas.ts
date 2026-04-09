import { z } from "zod";

function safeString(maxLen = 500) {
  return z.string().max(maxLen).transform((s) => {
    const trimmed = s.trim();
    if (/^[=+\-@]/.test(trimmed)) return "'" + trimmed;
    return trimmed;
  });
}

export const loginSchema = z.object({
  nombre: z.string().min(1).max(50),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export const llamadaSchema = z.object({
  lead_id: z.string().uuid(),
  estado: safeString(50),
  programa_pitcheado: safeString(50).optional(),
  concepto: safeString(30).optional(),
  plan_pago: safeString(30).optional(),
  ticket_total: z.number().min(0).default(0),
  reporte_general: safeString(2000).optional(),
  notas_internas: safeString(2000).optional(),
  lead_calificado: safeString(20).optional(),
});

export const pagoSchema = z.object({
  lead_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  numero_cuota: z.number().int().min(1).max(10),
  monto_usd: z.number().min(0).default(0),
  monto_ars: z.number().min(0).default(0),
  fecha_pago: z.string(),
  estado: z.enum(["pendiente", "pagado", "perdido"]).default("pagado"),
  metodo_pago: safeString(30),
  receptor: safeString(50),
  es_renovacion: z.boolean().default(false),
});

export const ventaChatSchema = z.object({
  nombre: safeString(100),
  instagram: safeString(100).optional(),
  telefono: safeString(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  programa_pitcheado: safeString(50),
  ticket_total: z.number().min(0),
  plan_pago: safeString(30),
  monto_usd: z.number().min(0),
  metodo_pago: safeString(30),
  receptor: safeString(50),
  setter_id: z.string().uuid(),
});

export const reporteSetterSchema = z.object({
  setter_id: z.string().uuid(),
  fecha: z.string(),
  conversaciones_iniciadas: z.number().int().min(0).default(0),
  respuestas_historias: z.number().int().min(0).default(0),
  calendarios_enviados: z.number().int().min(0).default(0),
  ventas_por_chat: safeString(500).optional(),
  agendas_confirmadas: safeString(500).optional(),
  origen_principal: z.array(z.string()).default([]),
});

export const followUpSchema = z.object({
  client_id: z.string().uuid(),
  tipo: z.enum(["llamada", "whatsapp", "dm", "email", "presencial"]),
  notas: safeString(2000),
  proxima_accion: safeString(500).optional(),
  proxima_fecha: z.string().optional(),
});

export const onboardingSchema = z.object({
  client_id: z.string().uuid(),
  lead_id: z.string().uuid().optional(),
  fecha_ingreso: z.string(),
  edad: z.number().int().min(15).max(99).optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefono: safeString(30).optional(),
  discord_user: safeString(100).optional(),
  skool_user: safeString(100).optional(),
  redes_sociales: safeString(500).optional(),
  red_social_origen: z.array(z.string()).default([]),
  porque_compro: safeString(2000).optional(),
  victoria_rapida: safeString(1000).optional(),
  resultado_esperado: safeString(1000).optional(),
  compromiso_pagos: z.boolean().default(false),
  confirmo_terminos: z.boolean().default(false),
  etapa_ecommerce: z.enum(["cero", "experiencia_sin_resultados", "experiencia_escalar"]).optional(),
  topico_compra: safeString(500).optional(),
});

export const sessionSchema = z.object({
  client_id: z.string().uuid(),
  fecha: z.string(),
  numero_sesion: z.number().int().min(1).default(1),
  tipo_sesion: z.enum(["estrategia_inicial", "revision_ajuste", "cierre_ciclo", "adicional"]).default("estrategia_inicial"),
  estado: z.enum(["programada", "done", "cancelada_no_asistio"]).default("programada"),
  enlace_llamada: safeString(500).optional(),
  assignee_id: z.string().uuid().optional(),
  notas_setup: safeString(2000).optional(),
  pitch_upsell: z.boolean().default(false),
  rating: z.number().int().min(1).max(10).optional(),
  aprendizaje_principal: safeString(2000).optional(),
  feedback_cliente: safeString(2000).optional(),
  herramienta_mas_util: safeString(500).optional(),
  action_items: z.array(z.object({
    task: z.string(),
    done: z.boolean().default(false),
  })).default([]),
  follow_up_date: z.string().optional(),
});

export const markPaidSchema = z.object({
  payment_id: z.string().uuid().nullable(),
  task_id: z.string().uuid().nullable(),
  monto_usd: z.number().min(0),
  monto_ars: z.number().min(0).default(0),
  metodo_pago: z.enum([
    "mercado_pago", "transferencia", "cash", "binance", "stripe", "wise",
  ]),
  receptor: z.string().min(1).max(100),
  cobrador_id: z.string().uuid(),
  comprobante_url: z.string().url().optional(),
});

export const agentTaskUpdateSchema = z.object({
  estado: z.enum(["pending", "in_progress", "done", "failed"]).optional(),
  prioridad: z.number().int().min(1).max(5).optional(),
  resultado: z.string().max(2000).optional(),
  notas: z.string().max(2000).optional(),
  asignado_a: z.enum(["agent", "human"]).optional(),
  human_assignee_id: z.string().uuid().optional(),
});

export const cobranzasLogSchema = z.object({
  task_id: z.string().uuid().nullable(),
  accion: z.string().min(1).max(2000),
  author_id: z.string().uuid(),
  mensaje_enviado: z.string().max(2000).optional(),
});

export const clientUpdateSchema = z.object({
  estado: z.enum(["activo", "pausado", "inactivo", "solo_skool", "no_termino_pagar"]).optional(),
  estado_seguimiento: z.enum(["para_seguimiento", "no_necesita", "seguimiento_urgente"]).optional(),
  estado_contacto: z.enum([
    "por_contactar", "contactado", "respondio_renueva", "respondio_debe_cuota",
    "es_socio", "no_renueva", "no_responde", "numero_invalido",
    "retirar_acceso", "verificar",
  ]).optional(),
  semana_1_estado: z.enum(["primeras_publicaciones", "primera_venta", "escalando_anuncios"]).optional().nullable(),
  semana_1_accionables: safeString(2000).optional().nullable(),
  semana_2_estado: z.enum(["primeras_publicaciones", "primera_venta", "escalando_anuncios"]).optional().nullable(),
  semana_2_accionables: safeString(2000).optional().nullable(),
  semana_3_estado: z.enum(["primeras_publicaciones", "primera_venta", "escalando_anuncios"]).optional().nullable(),
  semana_3_accionables: safeString(2000).optional().nullable(),
  semana_4_estado: z.enum(["primeras_publicaciones", "primera_venta", "escalando_anuncios"]).optional().nullable(),
  semana_4_accionables: safeString(2000).optional().nullable(),
  notas_seguimiento: safeString(5000).optional().nullable(),
  notas_conversacion: safeString(5000).optional().nullable(),
  fecha_ultimo_seguimiento: z.string().optional().nullable(),
  fecha_proximo_seguimiento: z.string().optional().nullable(),
  facturacion_mes_1: safeString(500).optional().nullable(),
  facturacion_mes_2: safeString(500).optional().nullable(),
  facturacion_mes_3: safeString(500).optional().nullable(),
  facturacion_mes_4: safeString(500).optional().nullable(),
});
