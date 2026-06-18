-- ============================================================================
-- 038 — Tokens de Google Calendar por closer
-- ============================================================================
-- Cada closer conecta su calendar de llamadas vía OAuth. Acá guardamos
-- access_token (corto), refresh_token (largo) y metadata para que el cron
-- lea sus eventos y compare contra leads de iClosed.

CREATE TABLE IF NOT EXISTS closer_calendar_tokens (
  team_member_id uuid PRIMARY KEY REFERENCES team_members(id) ON DELETE CASCADE,
  google_email   text NOT NULL,
  access_token   text NOT NULL,
  refresh_token  text NOT NULL,
  token_expiry   timestamptz NOT NULL,
  scope          text,
  connected_at   timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_sync_at   timestamptz,
  last_sync_ok   boolean,
  last_sync_msg  text
);

CREATE INDEX IF NOT EXISTS idx_closer_calendar_tokens_email
  ON closer_calendar_tokens(google_email);

COMMENT ON TABLE closer_calendar_tokens IS
  'OAuth tokens del calendar de llamadas de cada closer. Usado por el cron que cruza GCal vs leads para detectar agendas externas (Calendly + carga manual).';
