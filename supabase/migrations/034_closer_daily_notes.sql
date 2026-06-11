-- ============================================================================
-- 034 — Comentario del día del closer
-- ============================================================================
-- Para el form /cerrar-dia: el closer escribe un comentario libre del día
-- (notas, problemas, observaciones, etc.) y se incluye en el EOD WhatsApp.
-- ============================================================================

CREATE TABLE IF NOT EXISTS closer_daily_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  comentario text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (team_member_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_closer_daily_notes_fecha ON closer_daily_notes(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_closer_daily_notes_team ON closer_daily_notes(team_member_id, fecha DESC);
