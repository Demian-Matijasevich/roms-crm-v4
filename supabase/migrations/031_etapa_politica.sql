-- ============================================================================
-- Etapa pipeline política
-- Campo independiente para el board kanban del equipo política.
-- Estados: nuevo · caliente · aserrado · preserrado · cerrado · perdido
-- Cuando un lead se marca como nicho=politica y entra al board, su etapa_politica
-- empieza en 'nuevo'. Drag&drop actualiza solo este campo, no toca leads.estado.
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS etapa_politica TEXT
  CHECK (etapa_politica IS NULL OR etapa_politica IN ('nuevo','caliente','aserrado','preserrado','cerrado','perdido'));

CREATE INDEX IF NOT EXISTS idx_leads_etapa_politica ON leads(etapa_politica) WHERE etapa_politica IS NOT NULL;

-- Inicializar leads políticos existentes con etapa 'nuevo' si todavía no tienen una.
UPDATE leads SET etapa_politica = 'nuevo'
WHERE nicho = 'politica' AND etapa_politica IS NULL;
