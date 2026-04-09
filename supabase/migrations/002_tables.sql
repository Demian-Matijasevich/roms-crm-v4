-- ========================================
-- TEAM MEMBERS
-- ========================================
CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  nombre text NOT NULL,
  etiqueta text,
  rol text,
  email text,
  telefono text,
  fecha_nacimiento date,
  foto_url text,
  observaciones text,
  is_admin boolean DEFAULT false,
  is_closer boolean DEFAULT false,
  is_setter boolean DEFAULT false,
  is_cobranzas boolean DEFAULT false,
  is_seguimiento boolean DEFAULT false,
  comision_pct decimal DEFAULT 0,
  pin text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- PAYMENT METHODS
-- ========================================
CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  titular text,
  tipo_moneda moneda DEFAULT 'usd',
  cbu text,
  alias_cbu text,
  banco text,
  id_cuenta text,
  observaciones text
);

-- ========================================
-- LEADS
-- ========================================
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheets_row_index int,
  nombre text NOT NULL,
  email text,
  telefono text,
  instagram text,
  instagram_sin_arroba text GENERATED ALWAYS AS (
    CASE WHEN left(instagram, 1) = '@' THEN substring(instagram from 2)
    ELSE instagram END
  ) STORED,
  fuente lead_fuente,
  utm_source text,
  utm_medium text,
  utm_content text,
  evento_calendly text,
  calendly_event_id text,
  fecha_agendado timestamptz,
  fecha_llamada timestamptz,
  estado lead_estado DEFAULT 'pendiente',
  setter_id uuid REFERENCES team_members(id),
  closer_id uuid REFERENCES team_members(id),
  cobrador_id uuid REFERENCES team_members(id),
  contexto_setter text,
  reporte_general text,
  notas_internas text,
  experiencia_ecommerce text,
  seguridad_inversion text,
  tipo_productos text,
  compromiso_asistencia text,
  dispuesto_invertir text,
  decisor text,
  lead_calificado lead_calificacion,
  lead_score lead_score,
  link_llamada text,
  programa_pitcheado programa,
  concepto concepto_pago,
  plan_pago plan_pago,
  ticket_total decimal DEFAULT 0,
  fue_seguimiento boolean DEFAULT false,
  de_donde_viene_lead text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_leads_estado ON leads(estado);
CREATE INDEX idx_leads_closer ON leads(closer_id);
CREATE INDEX idx_leads_setter ON leads(setter_id);
CREATE INDEX idx_leads_fecha_llamada ON leads(fecha_llamada);

-- ========================================
-- CLIENTS
-- ========================================
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id),
  nombre text NOT NULL,
  email text,
  telefono text,
  programa programa,
  estado client_estado DEFAULT 'activo',
  fecha_onboarding date,
  fecha_offboarding date,
  total_dias_programa int DEFAULT 90,
  llamadas_base int DEFAULT 3,
  pesadilla boolean DEFAULT false,
  exito boolean DEFAULT false,
  discord boolean DEFAULT false,
  skool boolean DEFAULT false,
  win_discord boolean DEFAULT false,
  semana_1_estado semana_estado,
  semana_1_accionables text,
  semana_2_estado semana_estado,
  semana_2_accionables text,
  semana_3_estado semana_estado,
  semana_3_accionables text,
  semana_4_estado semana_estado,
  semana_4_accionables text,
  facturacion_mes_1 text,
  facturacion_mes_2 text,
  facturacion_mes_3 text,
  facturacion_mes_4 text,
  estado_seguimiento seguimiento_estado DEFAULT 'para_seguimiento',
  fecha_ultimo_seguimiento date,
  fecha_proximo_seguimiento date,
  notas_seguimiento text,
  notas_conversacion text,
  estado_contacto contacto_estado DEFAULT 'por_contactar',
  responsable_renovacion uuid REFERENCES team_members(id),
  origen origen_cliente,
  canal_contacto canal_contacto,
  prioridad_contacto prioridad_contacto,
  categoria categoria_cliente,
  email_skool text,
  en_wa_esa boolean DEFAULT false,
  en_ig_grupo boolean DEFAULT false,
  deudor_usd decimal DEFAULT 0,
  deudor_vencimiento date,
  health_score int DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_clients_estado ON clients(estado);
CREATE INDEX idx_clients_programa ON clients(programa);
CREATE INDEX idx_clients_health ON clients(health_score);

-- ========================================
-- RENEWAL HISTORY
-- ========================================
CREATE TABLE renewal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  tipo_renovacion tipo_renovacion,
  programa_anterior programa,
  programa_nuevo programa,
  monto_total decimal DEFAULT 0,
  plan_pago plan_pago,
  estado renovacion_estado,
  fecha_renovacion date,
  comprobante_url text,
  responsable_id uuid REFERENCES team_members(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_renewals_client ON renewal_history(client_id);

-- ========================================
-- PAYMENTS
-- ========================================
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id),
  client_id uuid REFERENCES clients(id),
  renewal_id uuid REFERENCES renewal_history(id),
  numero_cuota int DEFAULT 1,
  monto_usd decimal DEFAULT 0,
  monto_ars decimal DEFAULT 0,
  fecha_pago date,
  fecha_vencimiento date,
  estado payment_estado DEFAULT 'pendiente',
  metodo_pago metodo_pago,
  receptor text,
  comprobante_url text,
  cobrador_id uuid REFERENCES team_members(id),
  verificado boolean DEFAULT false,
  es_renovacion boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_payments_lead ON payments(lead_id);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_estado ON payments(estado);
CREATE INDEX idx_payments_fecha ON payments(fecha_pago);
CREATE INDEX idx_payments_receptor ON payments(receptor);

-- ========================================
-- TRACKER SESSIONS (1a1)
-- ========================================
CREATE TABLE tracker_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  fecha date,
  numero_sesion int DEFAULT 1,
  tipo_sesion session_tipo DEFAULT 'estrategia_inicial',
  estado session_estado DEFAULT 'programada',
  enlace_llamada text,
  assignee_id uuid REFERENCES team_members(id),
  notas_setup text,
  pitch_upsell boolean DEFAULT false,
  rating int CHECK (rating >= 1 AND rating <= 10),
  aprendizaje_principal text,
  feedback_cliente text,
  herramienta_mas_util text,
  action_items jsonb DEFAULT '[]'::jsonb,
  follow_up_date date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sessions_client ON tracker_sessions(client_id);
CREATE INDEX idx_sessions_estado ON tracker_sessions(estado);

-- ========================================
-- DAILY REPORTS
-- ========================================
CREATE TABLE daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id uuid NOT NULL REFERENCES team_members(id),
  fecha date NOT NULL,
  conversaciones_iniciadas int DEFAULT 0,
  respuestas_historias int DEFAULT 0,
  calendarios_enviados int DEFAULT 0,
  ventas_por_chat text,
  conversaciones_lead_inicio text,
  agendas_confirmadas text,
  origen_principal text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- IG METRICS
-- ========================================
CREATE TABLE ig_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text,
  fecha_inicio date,
  fecha_fin date,
  cuentas_alcanzadas int DEFAULT 0,
  delta_alcance_pct decimal DEFAULT 0,
  impresiones int DEFAULT 0,
  delta_impresiones_pct decimal DEFAULT 0,
  visitas_perfil int DEFAULT 0,
  delta_visitas_pct decimal DEFAULT 0,
  toques_enlaces int DEFAULT 0,
  delta_enlaces_pct decimal DEFAULT 0,
  pct_alcance_no_seguidores decimal DEFAULT 0,
  nuevos_seguidores int DEFAULT 0,
  delta_seguidores_pct decimal DEFAULT 0,
  unfollows int DEFAULT 0,
  total_seguidores int DEFAULT 0,
  total_interacciones int DEFAULT 0,
  delta_interacciones_pct decimal DEFAULT 0,
  cuentas_interaccion int DEFAULT 0,
  pct_interaccion_no_seguidores decimal DEFAULT 0,
  reels_publicados int DEFAULT 0,
  interacciones_reels int DEFAULT 0,
  delta_reels_pct decimal DEFAULT 0,
  likes_reels int DEFAULT 0,
  comentarios_reels int DEFAULT 0,
  compartidos_reels int DEFAULT 0,
  guardados_reels int DEFAULT 0,
  posts_publicados int DEFAULT 0,
  interacciones_posts int DEFAULT 0,
  delta_posts_pct decimal DEFAULT 0,
  likes_posts int DEFAULT 0,
  comentarios_posts int DEFAULT 0,
  compartidos_posts int DEFAULT 0,
  guardados_posts int DEFAULT 0,
  stories_publicadas int DEFAULT 0,
  interacciones_stories int DEFAULT 0,
  delta_stories_pct decimal DEFAULT 0,
  respuestas_stories int DEFAULT 0,
  conversaciones_dm int DEFAULT 0,
  pct_hombres decimal DEFAULT 0,
  pct_mujeres decimal DEFAULT 0,
  top_paises text,
  top_ciudades text,
  top_edades text,
  leads_ig int DEFAULT 0,
  ventas_ig int DEFAULT 0,
  cash_ig decimal DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- ONBOARDING
-- ========================================
CREATE TABLE onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),
  lead_id uuid REFERENCES leads(id),
  fecha_ingreso date,
  edad int,
  email text,
  telefono text,
  discord_user text,
  skool_user text,
  redes_sociales text,
  red_social_origen text[] DEFAULT '{}',
  porque_compro text,
  victoria_rapida text,
  resultado_esperado text,
  compromiso_pagos boolean DEFAULT false,
  confirmo_terminos boolean DEFAULT false,
  etapa_ecommerce etapa_ecommerce,
  topico_compra text,
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- AGENT TASKS
-- ========================================
CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo agent_task_tipo NOT NULL,
  client_id uuid REFERENCES clients(id),
  lead_id uuid REFERENCES leads(id),
  payment_id uuid REFERENCES payments(id),
  prioridad int DEFAULT 3 CHECK (prioridad >= 1 AND prioridad <= 5),
  estado agent_task_estado DEFAULT 'pending',
  asignado_a agent_asignacion DEFAULT 'human',
  human_assignee_id uuid REFERENCES team_members(id),
  canal canal_agente DEFAULT 'whatsapp',
  contexto jsonb DEFAULT '{}'::jsonb,
  scheduled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  resultado text,
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_tasks_estado ON agent_tasks(estado);
CREATE INDEX idx_agent_tasks_tipo ON agent_tasks(tipo);
CREATE INDEX idx_agent_tasks_prioridad ON agent_tasks(prioridad);

-- ========================================
-- AGENT LOG
-- ========================================
CREATE TABLE agent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES agent_tasks(id),
  accion text NOT NULL,
  mensaje_enviado text,
  respuesta_recibida text,
  resultado text,
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- CLIENT FOLLOW-UPS
-- ========================================
CREATE TABLE client_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  author_id uuid NOT NULL REFERENCES team_members(id),
  fecha date DEFAULT CURRENT_DATE,
  tipo followup_tipo DEFAULT 'whatsapp',
  notas text,
  proxima_accion text,
  proxima_fecha date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_followups_client ON client_follow_ups(client_id);

-- ========================================
-- UTM CAMPAIGNS
-- ========================================
CREATE TABLE utm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text,
  source text,
  medium text,
  content text,
  setter_id uuid REFERENCES team_members(id),
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- AUTO-UPDATE updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
