-- ============================================================
-- 025 — Mejoras inspiradas en Secure Scale CRM
-- ============================================================
-- 1. Separar "¿Se presentó?" de "Situación" (lead_estado).
-- 2. Trackear si cerró en la llamada o en seguimiento.
-- 3. URL de transcripción/grabación.
-- 4. Métricas de setting desagregadas por fuente + FUPs.

-- ── leads ────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS se_presento text
    CHECK (se_presento IS NULL OR se_presento IN ('si', 'no', 'cancelado'));

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cerrado_en_llamada boolean;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS transcripcion_url text;

COMMENT ON COLUMN leads.se_presento IS
  'Show up status: si=se presentó, no=no_show, cancelado=avisó antes';
COMMENT ON COLUMN leads.cerrado_en_llamada IS
  'true si el cierre fue en la misma llamada (cerró en vivo). false si cerró en seguimiento.';
COMMENT ON COLUMN leads.transcripcion_url IS
  'Link a la grabación / transcripción de la llamada (Fathom, Drive, etc).';

CREATE INDEX IF NOT EXISTS idx_leads_se_presento ON leads(se_presento);
CREATE INDEX IF NOT EXISTS idx_leads_cerrado_en_llamada ON leads(cerrado_en_llamada);

-- ── daily_reports: métricas setter expandidas ────────────────
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS fups int DEFAULT 0;

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS agendas int DEFAULT 0;

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS agendas_calificadas int DEFAULT 0;

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS fuente text
    CHECK (fuente IS NULL OR fuente IN ('ig', 'landing', 'whatsapp', 'otro'));

COMMENT ON COLUMN daily_reports.fups IS
  'Follow-ups enviados (mensajes a leads que no respondieron antes).';
COMMENT ON COLUMN daily_reports.agendas IS
  'Calls efectivamente agendadas en el dia (no calendarios enviados).';
COMMENT ON COLUMN daily_reports.agendas_calificadas IS
  'De las agendas, cuantas eran de leads calificados.';
COMMENT ON COLUMN daily_reports.fuente IS
  'Fuente principal del reporte (ig/landing/whatsapp). NULL = agregado de todas las fuentes.';

CREATE INDEX IF NOT EXISTS idx_daily_reports_fuente ON daily_reports(fuente);
