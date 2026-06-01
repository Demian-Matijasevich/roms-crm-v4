-- ============================================================
-- 026 — Cuotas + Forecast/Proyección
-- ============================================================
-- Paquete A (Predicción) + B (Flexibilidad operativa).

-- ── payments: snooze + tracking ──
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS snoozed_until date,
  ADD COLUMN IF NOT EXISTS snooze_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snooze_motivo text,
  ADD COLUMN IF NOT EXISTS fecha_estimada_pago date;

COMMENT ON COLUMN payments.snoozed_until IS
  'Si una cuota se posterga, fecha hasta cuando se snoozea. La cuota sale de "vencidas" hasta esa fecha.';
COMMENT ON COLUMN payments.snooze_count IS
  'Cuantas veces se postergo esta cuota. Senial de riesgo.';
COMMENT ON COLUMN payments.snooze_motivo IS
  'Motivo del ultimo snooze (cliente pidio tiempo, problema banco, etc).';
COMMENT ON COLUMN payments.fecha_estimada_pago IS
  'Fecha estimada acordada con el cliente (cuando promete pagar). Puede diferir de fecha_vencimiento.';

CREATE INDEX IF NOT EXISTS idx_payments_snoozed_until ON payments(snoozed_until);

-- Settings (meta_cash_mensual_usd, meta_ventas_mensual) viven en
-- team_members.observaciones del row __SYSTEM_CONFIG__ via lib/queries/settings.ts.
-- Se setean desde la UI cuando el admin actualiza la meta.
