-- Enums for ROMS CRM

CREATE TYPE lead_fuente AS ENUM (
  'historias', 'lead_magnet', 'youtube', 'instagram', 'dm_directo',
  'historia_cta', 'historia_hr', 'comentario_manychat', 'encuesta',
  'why_now', 'win', 'fup', 'whatsapp', 'otro'
);

CREATE TYPE lead_estado AS ENUM (
  'pendiente', 'no_show', 'cancelada', 'reprogramada', 'seguimiento',
  'no_calificado', 'no_cierre', 'reserva', 'cerrado',
  'adentro_seguimiento', 'broke_cancelado'
);

CREATE TYPE lead_calificacion AS ENUM ('calificado', 'no_calificado', 'podria');

CREATE TYPE lead_score AS ENUM ('A', 'B', 'C', 'D');

CREATE TYPE programa AS ENUM (
  'roms_7', 'consultoria', 'omnipresencia', 'multicuentas'
);

CREATE TYPE concepto_pago AS ENUM ('pif', 'fee', 'primera_cuota', 'segunda_cuota');

CREATE TYPE plan_pago AS ENUM ('paid_in_full', '2_cuotas', '3_cuotas', 'personalizado');

CREATE TYPE payment_estado AS ENUM ('pendiente', 'pagado', 'perdido', 'refund');

CREATE TYPE metodo_pago AS ENUM (
  'mercado_pago', 'transferencia', 'cash', 'binance', 'stripe', 'wise'
);

CREATE TYPE moneda AS ENUM ('ars', 'usd');

CREATE TYPE client_estado AS ENUM (
  'activo', 'pausado', 'inactivo', 'solo_skool', 'no_termino_pagar'
);

CREATE TYPE semana_estado AS ENUM (
  'primeras_publicaciones', 'primera_venta', 'escalando_anuncios'
);

CREATE TYPE seguimiento_estado AS ENUM (
  'para_seguimiento', 'no_necesita', 'seguimiento_urgente'
);

CREATE TYPE contacto_estado AS ENUM (
  'por_contactar', 'contactado', 'respondio_renueva', 'respondio_debe_cuota',
  'es_socio', 'no_renueva', 'no_responde', 'numero_invalido',
  'retirar_acceso', 'verificar'
);

CREATE TYPE tipo_renovacion AS ENUM (
  'resell', 'upsell', 'upsell_cuotas', 'resell_cuotas'
);

CREATE TYPE renovacion_estado AS ENUM ('pago', 'no_renueva', 'cuota_1_pagada', 'cuota_2_pagada');

CREATE TYPE origen_cliente AS ENUM (
  'registro_normal', 'referido', 'organico', 'paid_ads'
);

CREATE TYPE canal_contacto AS ENUM ('whatsapp', 'instagram_dm', 'email', 'buscar');

CREATE TYPE prioridad_contacto AS ENUM (
  'a_alta', 'b_media', 'c_baja', 'd_por_verificar'
);

CREATE TYPE categoria_cliente AS ENUM (
  'activo_ok', 'cuotas_pendientes', 'deudor',
  'por_verificar'
);

CREATE TYPE session_tipo AS ENUM (
  'estrategia_inicial', 'revision_ajuste', 'cierre_ciclo', 'adicional'
);

CREATE TYPE session_estado AS ENUM ('programada', 'done', 'cancelada_no_asistio');

CREATE TYPE etapa_ecommerce AS ENUM (
  'cero', 'experiencia_sin_resultados', 'experiencia_escalar'
);

CREATE TYPE agent_task_tipo AS ENUM (
  'cobrar_cuota', 'renovacion', 'seguimiento', 'oportunidad_upsell',
  'bienvenida', 'seguimiento_urgente', 'confirmar_pago'
);

CREATE TYPE agent_task_estado AS ENUM ('pending', 'in_progress', 'done', 'failed');

CREATE TYPE agent_asignacion AS ENUM ('agent', 'human');

CREATE TYPE canal_agente AS ENUM ('whatsapp', 'email', 'dm_instagram');

CREATE TYPE followup_tipo AS ENUM ('llamada', 'whatsapp', 'dm', 'email', 'presencial');
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
-- ========================================
-- FISCAL MONTH HELPER (standard calendar months: 1st to last day)
-- ========================================
-- Returns the fiscal month label for a given date.
-- ROMS uses standard calendar months.
CREATE OR REPLACE FUNCTION get_fiscal_month(d date)
RETURNS text AS $$
DECLARE
  month_names text[] := ARRAY[
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
BEGIN
  RETURN month_names[EXTRACT(MONTH FROM d)::int] || ' ' || EXTRACT(YEAR FROM d)::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Keep backward-compatible alias
CREATE OR REPLACE FUNCTION get_month_7_7(d date)
RETURNS text AS $$
BEGIN
  RETURN get_fiscal_month(d);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Returns start date of the current fiscal month (1st of month)
CREATE OR REPLACE FUNCTION current_fiscal_start()
RETURNS date AS $$
BEGIN
  RETURN date_trunc('month', CURRENT_DATE)::date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Returns end date of the current fiscal month (last day of month)
CREATE OR REPLACE FUNCTION current_fiscal_end()
RETURNS date AS $$
BEGIN
  RETURN (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Returns start of PREVIOUS fiscal month
CREATE OR REPLACE FUNCTION prev_fiscal_start()
RETURNS date AS $$
BEGIN
  RETURN (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if a date falls in the current fiscal month
CREATE OR REPLACE FUNCTION is_current_fiscal(d date)
RETURNS boolean AS $$
BEGIN
  RETURN d >= current_fiscal_start() AND d <= current_fiscal_end();
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================================
-- HEALTH SCORE CALCULATION
-- ========================================
CREATE OR REPLACE FUNCTION calculate_health_score(client_uuid uuid)
RETURNS int AS $$
DECLARE
  score decimal := 0;
  payment_score decimal := 0;
  session_score decimal := 0;
  progress_score decimal := 0;
  activity_score decimal := 0;
  billing_score decimal := 0;
  c clients%ROWTYPE;
  total_payments int;
  paid_on_time int;
  total_sessions int;
  done_sessions int;
  avg_rating decimal;
  weeks_filled int;
  days_since_followup int;
BEGIN
  SELECT * INTO c FROM clients WHERE id = client_uuid;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- PAYMENT SCORE (30%) — ratio of on-time payments
  SELECT
    count(*),
    count(*) FILTER (WHERE estado = 'pagado')
  INTO total_payments, paid_on_time
  FROM payments WHERE client_id = client_uuid OR lead_id = c.lead_id;

  IF total_payments > 0 THEN
    payment_score := (paid_on_time::decimal / total_payments) * 30;
  ELSE
    payment_score := 15; -- No payments yet, neutral
  END IF;

  -- SESSION SCORE (20%) — avg rating + completion ratio
  SELECT
    count(*),
    count(*) FILTER (WHERE estado = 'done'),
    coalesce(avg(rating) FILTER (WHERE rating IS NOT NULL), 0)
  INTO total_sessions, done_sessions, avg_rating
  FROM tracker_sessions WHERE client_id = client_uuid;

  IF c.llamadas_base > 0 THEN
    session_score := (least(done_sessions::decimal / c.llamadas_base, 1.0) * 10)
                   + (least(avg_rating / 10.0, 1.0) * 10);
  ELSE
    session_score := 10;
  END IF;

  -- PROGRESS SCORE (20%) — weeks with status filled
  weeks_filled := 0;
  IF c.semana_1_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  IF c.semana_2_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  IF c.semana_3_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  IF c.semana_4_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  progress_score := (weeks_filled::decimal / 4) * 20;

  -- ACTIVITY SCORE (15%) — days since last follow-up
  IF c.fecha_ultimo_seguimiento IS NOT NULL THEN
    days_since_followup := CURRENT_DATE - c.fecha_ultimo_seguimiento;
    IF days_since_followup <= 7 THEN activity_score := 15;
    ELSIF days_since_followup <= 14 THEN activity_score := 10;
    ELSIF days_since_followup <= 30 THEN activity_score := 5;
    ELSE activity_score := 0;
    END IF;
  ELSE
    activity_score := 5;
  END IF;

  -- BILLING SCORE (15%) — has reported billing
  billing_score := 0;
  IF c.facturacion_mes_1 IS NOT NULL AND c.facturacion_mes_1 != '' THEN billing_score := billing_score + 3.75; END IF;
  IF c.facturacion_mes_2 IS NOT NULL AND c.facturacion_mes_2 != '' THEN billing_score := billing_score + 3.75; END IF;
  IF c.facturacion_mes_3 IS NOT NULL AND c.facturacion_mes_3 != '' THEN billing_score := billing_score + 3.75; END IF;
  IF c.facturacion_mes_4 IS NOT NULL AND c.facturacion_mes_4 != '' THEN billing_score := billing_score + 3.75; END IF;

  score := payment_score + session_score + progress_score + activity_score + billing_score;
  RETURN least(greatest(round(score)::int, 0), 100);
END;
$$ LANGUAGE plpgsql STABLE;
-- ========================================
-- V_MONTHLY_CASH: Cash collected per calendar month
-- ========================================
CREATE OR REPLACE VIEW v_monthly_cash AS
SELECT
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS cash_ventas_nuevas,
  sum(p.monto_usd) FILTER (WHERE p.es_renovacion AND p.estado = 'pagado') AS cash_renovaciones,
  sum(p.monto_usd) FILTER (WHERE p.numero_cuota > 1 AND NOT p.es_renovacion AND p.estado = 'pagado') AS cash_cuotas,
  coalesce(sum(p.monto_usd) FILTER (WHERE p.estado = 'pagado'), 0)
    - coalesce(sum(p.monto_usd) FILTER (WHERE p.estado = 'refund'), 0) AS cash_total,
  sum(p.monto_usd) FILTER (WHERE p.estado = 'refund') AS refunds,
  sum(l.ticket_total) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS facturacion,
  count(DISTINCT p.lead_id) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS ventas_nuevas_count,
  count(*) FILTER (WHERE p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS renovaciones_count,
  (SELECT coalesce(sum(pp.monto_usd), 0)
   FROM payments pp
   WHERE pp.estado = 'pendiente'
     AND pp.fecha_vencimiento <= CURRENT_DATE
     AND pp.fecha_vencimiento >= CURRENT_DATE - interval '30 days'
  ) AS saldo_pendiente_30d
FROM payments p
LEFT JOIN leads l ON p.lead_id = l.id
WHERE p.fecha_pago IS NOT NULL AND p.estado IN ('pagado', 'refund')
GROUP BY get_fiscal_month(p.fecha_pago);

-- ========================================
-- V_COMMISSIONS: Comisiones por persona per calendar month
-- ========================================
CREATE VIEW v_commissions AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  coalesce(sum(p.monto_usd) FILTER (WHERE l.closer_id = tm.id), 0) * 0.10 AS comision_closer,
  coalesce(sum(p.monto_usd) FILTER (WHERE l.setter_id = tm.id), 0) * 0.05 AS comision_setter,
  coalesce(sum(p.monto_usd) FILTER (WHERE l.closer_id = tm.id), 0) * 0.10
  + coalesce(sum(p.monto_usd) FILTER (WHERE l.setter_id = tm.id), 0) * 0.05 AS comision_total
FROM team_members tm
JOIN payments p ON (p.lead_id IN (SELECT id FROM leads WHERE closer_id = tm.id OR setter_id = tm.id))
LEFT JOIN leads l ON p.lead_id = l.id
WHERE p.estado = 'pagado' AND p.fecha_pago IS NOT NULL AND tm.activo = true
GROUP BY tm.id, tm.nombre, get_fiscal_month(p.fecha_pago);

-- ========================================
-- V_TREASURY: Flujo por receptor
-- ========================================
CREATE OR REPLACE VIEW v_treasury AS
SELECT
  p.receptor,
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  p.metodo_pago,
  sum(p.monto_usd) AS total_usd,
  sum(p.monto_ars) AS total_ars,
  count(*) AS num_pagos,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1) AS usd_ventas_nuevas,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota > 1) AS usd_cuotas,
  sum(p.monto_usd) FILTER (WHERE p.es_renovacion) AS usd_renovaciones
FROM payments p
WHERE p.estado = 'pagado' AND p.fecha_pago IS NOT NULL
GROUP BY p.receptor, get_fiscal_month(p.fecha_pago), p.metodo_pago;

-- ========================================
-- V_PIPELINE: Estado del pipeline
-- ========================================
CREATE OR REPLACE VIEW v_pipeline AS
SELECT
  get_fiscal_month(l.fecha_llamada::date) AS mes_fiscal,
  count(*) AS total_leads,
  count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada')) AS presentadas,
  count(*) FILTER (WHERE l.lead_calificado = 'calificado') AS calificadas,
  count(*) FILTER (WHERE l.estado = 'cerrado') AS cerradas,
  CASE WHEN count(*) > 0 THEN
    round(count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show'))::decimal / count(*) * 100, 1)
  ELSE 0 END AS show_up_rate,
  CASE WHEN count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) > 0 THEN
    round(count(*) FILTER (WHERE l.estado = 'cerrado')::decimal / count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) * 100, 1)
  ELSE 0 END AS cierre_rate,
  CASE WHEN count(*) FILTER (WHERE l.estado = 'cerrado') > 0 THEN
    round(avg(l.ticket_total) FILTER (WHERE l.estado = 'cerrado'), 0)
  ELSE 0 END AS aov
FROM leads l
WHERE l.fecha_llamada IS NOT NULL
GROUP BY get_fiscal_month(l.fecha_llamada::date);

-- ========================================
-- V_RENEWAL_QUEUE: Cola de renovaciones
-- ========================================
CREATE OR REPLACE VIEW v_renewal_queue AS
SELECT
  c.id,
  c.nombre,
  c.programa,
  c.fecha_onboarding,
  c.total_dias_programa,
  c.fecha_onboarding + c.total_dias_programa AS fecha_vencimiento,
  (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE AS dias_restantes,
  c.estado_contacto,
  c.health_score,
  CASE
    WHEN (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE < 0 THEN 'vencido'
    WHEN (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE <= 7 THEN 'urgente'
    WHEN (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE <= 15 THEN 'proximo'
    ELSE 'ok'
  END AS semaforo
FROM clients c
WHERE c.estado = 'activo' AND c.fecha_onboarding IS NOT NULL
ORDER BY dias_restantes ASC;

-- ========================================
-- V_SESSION_AVAILABILITY: Sesiones 1a1
-- ========================================
CREATE OR REPLACE VIEW v_session_availability AS
SELECT
  c.id AS client_id,
  c.nombre,
  c.programa,
  c.llamadas_base,
  count(ts.id) FILTER (WHERE ts.estado = 'done') AS sesiones_consumidas,
  c.llamadas_base - count(ts.id) FILTER (WHERE ts.estado = 'done') AS sesiones_disponibles,
  CASE
    WHEN c.llamadas_base - count(ts.id) FILTER (WHERE ts.estado = 'done') <= 0 THEN 'agotadas'
    WHEN c.llamadas_base - count(ts.id) FILTER (WHERE ts.estado = 'done') = 1 THEN 'ultima'
    ELSE 'disponible'
  END AS semaforo,
  round(avg(ts.rating) FILTER (WHERE ts.rating IS NOT NULL), 1) AS rating_promedio
FROM clients c
LEFT JOIN tracker_sessions ts ON ts.client_id = c.id
WHERE c.estado = 'activo'
GROUP BY c.id, c.nombre, c.programa, c.llamadas_base;

-- ========================================
-- V_CLOSER_KPIS
-- ========================================
CREATE OR REPLACE VIEW v_closer_kpis AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(l.fecha_llamada::date) AS mes_fiscal,
  count(*) AS total_agendas,
  count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) AS presentadas,
  count(*) FILTER (WHERE l.lead_calificado = 'calificado') AS calificadas,
  count(*) FILTER (WHERE l.estado = 'cerrado') AS cerradas,
  CASE WHEN count(*) > 0 THEN
    round(count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show'))::decimal / count(*) * 100, 1)
  ELSE 0 END AS show_up_pct,
  CASE WHEN count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) > 0 THEN
    round(count(*) FILTER (WHERE l.estado = 'cerrado')::decimal / count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) * 100, 1)
  ELSE 0 END AS cierre_pct,
  coalesce(round(avg(l.ticket_total) FILTER (WHERE l.estado = 'cerrado'), 0), 0) AS aov
FROM team_members tm
JOIN leads l ON l.closer_id = tm.id
WHERE tm.is_closer = true AND l.fecha_llamada IS NOT NULL
GROUP BY tm.id, tm.nombre, get_fiscal_month(l.fecha_llamada::date);

-- ========================================
-- V_SETTER_KPIS
-- ========================================
CREATE OR REPLACE VIEW v_setter_kpis AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(l.fecha_agendado::date) AS mes_fiscal,
  count(*) AS total_agendas,
  count(*) FILTER (WHERE l.estado = 'cerrado') AS cerradas
FROM team_members tm
JOIN leads l ON l.setter_id = tm.id
WHERE tm.is_setter = true AND l.fecha_agendado IS NOT NULL
GROUP BY tm.id, tm.nombre, get_fiscal_month(l.fecha_agendado::date);
-- Enable RLS on all tables
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's team_member row
CREATE OR REPLACE FUNCTION get_my_team_member()
RETURNS team_members AS $$
  SELECT * FROM team_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ADMIN: full access to everything
CREATE POLICY admin_all_leads ON leads FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_clients ON clients FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_payments ON payments FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_sessions ON tracker_sessions FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_reports ON daily_reports FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_ig ON ig_metrics FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_onboarding ON onboarding FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_followups ON client_follow_ups FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_renewals ON renewal_history FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_utm ON utm_campaigns FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_payment_methods ON payment_methods FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_tasks ON agent_tasks FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY agent_log_visible ON agent_log FOR SELECT
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY agent_log_insert ON agent_log FOR INSERT
  WITH CHECK (true); -- Service role inserts

-- CLOSER: see own leads
CREATE POLICY closer_own_leads ON leads FOR SELECT
  USING (closer_id = (get_my_team_member()).id);

CREATE POLICY closer_own_payments ON payments FOR SELECT
  USING (lead_id IN (SELECT id FROM leads WHERE closer_id = (get_my_team_member()).id));

-- SETTER: see own leads + insert
CREATE POLICY setter_own_leads ON leads FOR SELECT
  USING (setter_id = (get_my_team_member()).id);

CREATE POLICY setter_insert_reports ON daily_reports FOR INSERT
  WITH CHECK (setter_id = (get_my_team_member()).id);

CREATE POLICY setter_own_reports ON daily_reports FOR SELECT
  USING (setter_id = (get_my_team_member()).id);

-- SEGUIMIENTO: see clients and follow-ups
CREATE POLICY seguimiento_clients ON clients FOR SELECT
  USING ((get_my_team_member()).is_seguimiento = true);

CREATE POLICY seguimiento_followups ON client_follow_ups FOR ALL
  USING ((get_my_team_member()).is_seguimiento = true);

CREATE POLICY seguimiento_sessions ON tracker_sessions FOR SELECT
  USING ((get_my_team_member()).is_seguimiento = true);

-- TEAM MEMBERS: everyone can read
CREATE POLICY team_read ON team_members FOR SELECT
  USING (true);

-- Leaderboard: all closers/setters can read all leads for ranking
CREATE POLICY leaderboard_leads ON leads FOR SELECT
  USING ((get_my_team_member()).is_closer = true OR (get_my_team_member()).is_setter = true);

-- Service role bypass (for n8n and migrations)
-- Note: service_role key bypasses RLS automatically in Supabase
-- Seed team members for ROMS
INSERT INTO team_members (nombre, etiqueta, rol, is_admin, is_closer, is_setter, is_cobranzas, is_seguimiento, comision_pct, pin) VALUES
  ('Fran', 'fran', 'admin', true, false, false, false, false, 0, '1001'),
  ('Juanma', 'juanma', 'admin', true, false, false, false, false, 0, '1002'),
  ('Valentino', 'valentino', 'closer_setter', false, true, true, false, false, 0.10, '2001'),
  ('Agust\u00edn', 'agustin', 'closer', false, true, false, false, false, 0.10, '2002'),
  ('Juan Mart\u00edn', 'juanmartin', 'closer', false, true, false, false, false, 0.10, '2003'),
  ('Fede', 'fede', 'closer', false, true, false, false, false, 0.10, '2004'),
  ('Guille', 'guille', 'setter', false, false, true, false, false, 0.05, '3001');

-- Seed payment methods for ROMS
INSERT INTO payment_methods (nombre, titular, tipo_moneda) VALUES
  ('Mercado Pago', 'ROMS', 'ars'),
  ('Transferencia', 'ROMS', 'usd'),
  ('Cash', NULL, 'usd'),
  ('Binance', 'ROMS', 'usd'),
  ('Stripe', 'ROMS', 'usd'),
  ('Wise', 'ROMS', 'usd');
