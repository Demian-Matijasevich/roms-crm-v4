-- ============================================================================
-- 032 — Vistas paralelas con columna `nicho` para filtros del CRM política.
-- Las vistas originales (v_monthly_cash, v_treasury, v_closer_kpis) agregan
-- globalmente sin saber de nicho. Cada `_by_nicho` agrupa también por nicho
-- del lead para poder filtrar `.eq('nicho', 'politica')`.
-- ============================================================================

-- v_monthly_cash_by_nicho
CREATE OR REPLACE VIEW v_monthly_cash_by_nicho AS
SELECT
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  COALESCE(l.nicho, 'general') AS nicho,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS cash_ventas_nuevas,
  sum(p.monto_usd) FILTER (WHERE p.es_renovacion AND p.estado = 'pagado') AS cash_renovaciones,
  sum(p.monto_usd) FILTER (WHERE p.numero_cuota > 1 AND NOT p.es_renovacion AND p.estado = 'pagado') AS cash_cuotas,
  coalesce(sum(p.monto_usd) FILTER (WHERE p.estado = 'pagado'), 0)
    - coalesce(sum(p.monto_usd) FILTER (WHERE p.estado = 'refund'), 0) AS cash_total,
  sum(p.monto_usd) FILTER (WHERE p.estado = 'refund') AS refunds,
  sum(l.ticket_total) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS facturacion,
  count(DISTINCT p.lead_id) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS ventas_nuevas_count,
  count(*) FILTER (WHERE p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS renovaciones_count
FROM payments p
LEFT JOIN leads l ON p.lead_id = l.id
WHERE p.fecha_pago IS NOT NULL AND p.estado IN ('pagado', 'refund')
GROUP BY get_fiscal_month(p.fecha_pago), COALESCE(l.nicho, 'general');

-- v_treasury_by_nicho
CREATE OR REPLACE VIEW v_treasury_by_nicho AS
SELECT
  p.receptor,
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  COALESCE(l.nicho, 'general') AS nicho,
  p.metodo_pago,
  sum(p.monto_usd) AS total_usd,
  sum(p.monto_ars) AS total_ars,
  count(*) AS num_pagos,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1) AS usd_ventas_nuevas,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota > 1) AS usd_cuotas,
  sum(p.monto_usd) FILTER (WHERE p.es_renovacion) AS usd_renovaciones
FROM payments p
LEFT JOIN leads l ON p.lead_id = l.id
WHERE p.estado = 'pagado' AND p.fecha_pago IS NOT NULL
GROUP BY p.receptor, get_fiscal_month(p.fecha_pago), COALESCE(l.nicho, 'general'), p.metodo_pago;

-- v_closer_kpis_by_nicho — kpis por closer + mes + nicho
-- Se basa en payments (lead.closer_id) — replica la lógica esencial de v_closer_kpis.
CREATE OR REPLACE VIEW v_closer_kpis_by_nicho AS
SELECT
  l.closer_id,
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  COALESCE(l.nicho, 'general') AS nicho,
  count(DISTINCT p.lead_id) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS ventas_cerradas,
  sum(p.monto_usd) FILTER (WHERE p.estado = 'pagado') AS cash_collected,
  sum(l.ticket_total) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS facturacion
FROM payments p
LEFT JOIN leads l ON p.lead_id = l.id
WHERE l.closer_id IS NOT NULL AND p.fecha_pago IS NOT NULL
GROUP BY l.closer_id, get_fiscal_month(p.fecha_pago), COALESCE(l.nicho, 'general');
