-- ============================================================================
-- 035 — Índices de performance para queries calientes
-- ============================================================================
-- Las vistas /cerrar-dia, /eod, dashboard de closer, pipeline y EOD WhatsApp
-- todas filtran por algún combo de (closer_id, estado, fecha_agendado o
-- fecha_llamada). Sin índices compuestos, Postgres hace seq scan sobre la
-- tabla de leads (~2k filas y creciendo) cada request.
-- ============================================================================

-- Para /cerrar-dia + /eod + EOD report: rango de día + closer + estado
CREATE INDEX IF NOT EXISTS idx_leads_fecha_agendado_closer
  ON leads(fecha_agendado DESC, closer_id, estado)
  WHERE fecha_agendado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_fecha_llamada_closer
  ON leads(fecha_llamada DESC, closer_id, estado)
  WHERE fecha_llamada IS NOT NULL;

-- Para huérfanos del día (closer_id NULL + estado pendiente)
CREATE INDEX IF NOT EXISTS idx_leads_huerfanos_pendientes
  ON leads(fecha_agendado DESC)
  WHERE closer_id IS NULL AND estado = 'pendiente';

-- Para dashboards de closer (mi pipeline, mis cerrados)
CREATE INDEX IF NOT EXISTS idx_leads_closer_estado
  ON leads(closer_id, estado)
  WHERE closer_id IS NOT NULL;

-- Para webhooks iClosed/Calendly: lookup por email (es UNIQUE candidate también)
CREATE INDEX IF NOT EXISTS idx_leads_email_lower
  ON leads(LOWER(email))
  WHERE email IS NOT NULL;

-- Para sync con Sheets (sheets_row_index lookups)
CREATE INDEX IF NOT EXISTS idx_leads_sheets_row
  ON leads(sheets_row_index)
  WHERE sheets_row_index IS NOT NULL;

-- Pagos: queries de EOD por fecha + estado pagado
CREATE INDEX IF NOT EXISTS idx_payments_fecha_estado
  ON payments(fecha_pago DESC, estado)
  WHERE estado = 'pagado';

-- Pagos por lead (cuotas + dashboards)
CREATE INDEX IF NOT EXISTS idx_payments_lead_cuota
  ON payments(lead_id, numero_cuota);
