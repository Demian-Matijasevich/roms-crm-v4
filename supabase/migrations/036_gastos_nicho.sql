-- ============================================================================
-- 036 — Agregar campo nicho a gastos para separación política / general
-- ============================================================================
-- Reportado: en vista política aparecían gastos del ROMS normal mezclados.
-- Causa: la tabla gastos no tenía campo nicho, era global.
-- ============================================================================

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS nicho text NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_gastos_nicho ON gastos(nicho);

-- Por defecto todos los gastos históricos quedan en 'general'.
-- Los gastos de política se irán taggeando manualmente desde la UI de finanzas.
