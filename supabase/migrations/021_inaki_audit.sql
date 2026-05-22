-- ============================================================
-- 021 — Auditoría Iñaki: fecha de cierre estimada para reservas
-- ============================================================
-- Punto 6 del audit: cuando un lead queda en estado "reserva",
-- el closer debe cargar la fecha estimada en que el cliente
-- termina de pagar / cierra el programa completo.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fecha_cierre_estimada date;

COMMENT ON COLUMN leads.fecha_cierre_estimada IS
  'Fecha estimada de cierre completo (deadline) cuando el lead esta en reserva.';
