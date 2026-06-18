-- ============================================================================
-- 037 — Reporte de setter: campo "aclaracion" (texto libre)
-- ============================================================================
-- Form EOD simplificado a 4 campos: conversaciones, agendas enviadas (=calendarios),
-- agendadas (=agendas), aclaracion. Esta migration agrega la columna nueva.
-- Los campos viejos (respuestas_historias, fups, fuente, etc.) quedan tal cual
-- para no romper data histórica.

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS aclaracion text;
