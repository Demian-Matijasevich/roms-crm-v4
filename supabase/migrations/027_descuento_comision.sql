-- ============================================================
-- 027 — Descuento de comisión configurable por refund
-- ============================================================
-- Cuando se procesa un refund, Juanma negocia con el closer/setter
-- cuánto descontarles de comisión. No siempre es el % default
-- (10% closer, 5% setter del monto refundeado). Puede ser 0, 50%,
-- el total, o cualquier otra cosa.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS descuento_comision_closer_usd numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_comision_setter_usd numeric DEFAULT 0;

COMMENT ON COLUMN payments.descuento_comision_closer_usd IS
  'Monto USD a descontar de la comision del closer (tipicamente cuando hay refund). Editado a mano por admin.';
COMMENT ON COLUMN payments.descuento_comision_setter_usd IS
  'Monto USD a descontar de la comision del setter (tipicamente cuando hay refund). Editado a mano por admin.';

-- ── Actualizar v_commissions para restar los descuentos ──
DROP VIEW IF EXISTS v_commissions;

CREATE VIEW v_commissions AS
WITH cobrado AS (
  SELECT
    tm.id AS team_member_id,
    tm.nombre,
    get_fiscal_month(p.fecha_pago) AS mes_fiscal,
    coalesce(sum(p.monto_usd) FILTER (WHERE l.closer_id = tm.id AND p.estado = 'pagado'), 0) AS base_closer,
    coalesce(sum(p.monto_usd) FILTER (WHERE l.setter_id = tm.id AND p.estado = 'pagado'), 0) AS base_setter,
    coalesce(sum(p.descuento_comision_closer_usd) FILTER (WHERE l.closer_id = tm.id), 0) AS desc_closer,
    coalesce(sum(p.descuento_comision_setter_usd) FILTER (WHERE l.setter_id = tm.id), 0) AS desc_setter
  FROM team_members tm
  JOIN payments p ON (p.lead_id IN (SELECT id FROM leads WHERE closer_id = tm.id OR setter_id = tm.id))
  LEFT JOIN leads l ON p.lead_id = l.id
  WHERE p.fecha_pago IS NOT NULL AND tm.activo = true
  GROUP BY tm.id, tm.nombre, get_fiscal_month(p.fecha_pago)
)
SELECT
  team_member_id,
  nombre,
  mes_fiscal,
  base_closer * 0.10 - desc_closer AS comision_closer,
  base_setter * 0.05 - desc_setter AS comision_setter,
  (base_closer * 0.10 - desc_closer) + (base_setter * 0.05 - desc_setter) AS comision_total
FROM cobrado;
