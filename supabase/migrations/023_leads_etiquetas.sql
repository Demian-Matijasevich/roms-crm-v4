-- ============================================================
-- 023 — Etiquetas en leads
-- ============================================================
-- Lo pidió Juanma en la reu del 2026-05-25: poder ponerle etiquetas
-- a cada lead (no para política, eso queda en WA privado — sí para
-- categorizar operativamente: urgente, alto-ticket, frio, etc).
--
-- Las notas ya existen via columnas notas_internas / reporte_general
-- / contexto_setter — no requieren cambio de schema.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}';

-- Índice GIN para búsquedas tipo etiquetas @> ARRAY['urgente']
CREATE INDEX IF NOT EXISTS idx_leads_etiquetas ON leads USING GIN (etiquetas);

COMMENT ON COLUMN leads.etiquetas IS
  'Etiquetas operativas del lead (urgente, alto-ticket, frio, etc). Para política/sensible usar WA privado.';
