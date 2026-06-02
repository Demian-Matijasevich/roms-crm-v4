-- ============================================================
-- 030 — Notificaciones in-app
-- ============================================================
-- Sistema de notificaciones que aparecen en el sidebar.
-- Cada notif se asigna a un team_member.

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES team_members(id),
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensaje text,
  link text,
  meta jsonb,
  leida boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifs_recipient_unread ON notifications(recipient_id) WHERE leida = false;
CREATE INDEX IF NOT EXISTS idx_notifs_created ON notifications(created_at DESC);

COMMENT ON TABLE notifications IS
  'Notificaciones in-app por team_member. Tipo: lead_frio | refund | cuota_riesgo | apure | ventas | etc.';
