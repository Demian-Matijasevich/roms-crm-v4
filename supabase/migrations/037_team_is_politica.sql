-- ============================================================================
-- 037 — Flag is_politica en team_members
-- ============================================================================
-- Antes la lista del equipo política estaba hardcoded en lib/notifications.ts.
-- Ahora se gestiona desde DB: cualquier admin puede tildar/destildar.
-- ============================================================================

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_politica boolean NOT NULL DEFAULT false;

-- Pre-poblar con la whitelist legacy para no romper notificaciones.
UPDATE team_members
SET is_politica = true
WHERE activo = true AND nombre IN ('Juanma', 'Mati', 'Fran', 'Seba', 'Nacho', 'Nicolás');

CREATE INDEX IF NOT EXISTS idx_team_is_politica ON team_members(is_politica) WHERE is_politica = true;
