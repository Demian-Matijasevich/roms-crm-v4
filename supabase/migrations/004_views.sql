-- ========================================
-- V_MONTHLY_CASH: Cash collected per calendar month
-- ========================================
CREATE OR REPLACE VIEW v_monthly_cash AS
SELECT
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS cash_ventas_nuevas,
  sum(p.monto_usd) FILTER (WHERE p.es_renovacion AND p.estado = 'pagado') AS cash_renovaciones,
  sum(p.monto_usd) FILTER (WHERE p.numero_cuota > 1 AND NOT p.es_renovacion AND p.estado = 'pagado') AS cash_cuotas,
  coalesce(sum(p.monto_usd) FILTER (WHERE p.estado = 'pagado'), 0)
    - coalesce(sum(p.monto_usd) FILTER (WHERE p.estado = 'refund'), 0) AS cash_total,
  sum(p.monto_usd) FILTER (WHERE p.estado = 'refund') AS refunds,
  sum(l.ticket_total) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS facturacion,
  count(DISTINCT p.lead_id) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS ventas_nuevas_count,
  count(*) FILTER (WHERE p.es_renovacion AND p.numero_cuota = 1 AND p.estado = 'pagado') AS renovaciones_count,
  (SELECT coalesce(sum(pp.monto_usd), 0)
   FROM payments pp
   WHERE pp.estado = 'pendiente'
     AND pp.fecha_vencimiento <= CURRENT_DATE
     AND pp.fecha_vencimiento >= CURRENT_DATE - interval '30 days'
  ) AS saldo_pendiente_30d
FROM payments p
LEFT JOIN leads l ON p.lead_id = l.id
WHERE p.fecha_pago IS NOT NULL AND p.estado IN ('pagado', 'refund')
GROUP BY get_fiscal_month(p.fecha_pago);

-- ========================================
-- V_COMMISSIONS: Comisiones por persona per calendar month
-- ========================================
CREATE VIEW v_commissions AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  coalesce(sum(p.monto_usd) FILTER (WHERE l.closer_id = tm.id), 0) * 0.10 AS comision_closer,
  coalesce(sum(p.monto_usd) FILTER (WHERE l.setter_id = tm.id), 0) * 0.05 AS comision_setter,
  coalesce(sum(p.monto_usd) FILTER (WHERE l.closer_id = tm.id), 0) * 0.10
  + coalesce(sum(p.monto_usd) FILTER (WHERE l.setter_id = tm.id), 0) * 0.05 AS comision_total
FROM team_members tm
JOIN payments p ON (p.lead_id IN (SELECT id FROM leads WHERE closer_id = tm.id OR setter_id = tm.id))
LEFT JOIN leads l ON p.lead_id = l.id
WHERE p.estado = 'pagado' AND p.fecha_pago IS NOT NULL AND tm.activo = true
GROUP BY tm.id, tm.nombre, get_fiscal_month(p.fecha_pago);

-- ========================================
-- V_TREASURY: Flujo por receptor
-- ========================================
CREATE OR REPLACE VIEW v_treasury AS
SELECT
  p.receptor,
  get_fiscal_month(p.fecha_pago) AS mes_fiscal,
  p.metodo_pago,
  sum(p.monto_usd) AS total_usd,
  sum(p.monto_ars) AS total_ars,
  count(*) AS num_pagos,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota = 1) AS usd_ventas_nuevas,
  sum(p.monto_usd) FILTER (WHERE NOT p.es_renovacion AND p.numero_cuota > 1) AS usd_cuotas,
  sum(p.monto_usd) FILTER (WHERE p.es_renovacion) AS usd_renovaciones
FROM payments p
WHERE p.estado = 'pagado' AND p.fecha_pago IS NOT NULL
GROUP BY p.receptor, get_fiscal_month(p.fecha_pago), p.metodo_pago;

-- ========================================
-- V_PIPELINE: Estado del pipeline
-- ========================================
CREATE OR REPLACE VIEW v_pipeline AS
SELECT
  get_fiscal_month(l.fecha_llamada::date) AS mes_fiscal,
  count(*) AS total_leads,
  count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada')) AS presentadas,
  count(*) FILTER (WHERE l.lead_calificado = 'calificado') AS calificadas,
  count(*) FILTER (WHERE l.estado = 'cerrado') AS cerradas,
  CASE WHEN count(*) > 0 THEN
    round(count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show'))::decimal / count(*) * 100, 1)
  ELSE 0 END AS show_up_rate,
  CASE WHEN count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) > 0 THEN
    round(count(*) FILTER (WHERE l.estado = 'cerrado')::decimal / count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) * 100, 1)
  ELSE 0 END AS cierre_rate,
  CASE WHEN count(*) FILTER (WHERE l.estado = 'cerrado') > 0 THEN
    round(avg(l.ticket_total) FILTER (WHERE l.estado = 'cerrado'), 0)
  ELSE 0 END AS aov
FROM leads l
WHERE l.fecha_llamada IS NOT NULL
GROUP BY get_fiscal_month(l.fecha_llamada::date);

-- ========================================
-- V_RENEWAL_QUEUE: Cola de renovaciones
-- ========================================
CREATE OR REPLACE VIEW v_renewal_queue AS
SELECT
  c.id,
  c.nombre,
  c.programa,
  c.fecha_onboarding,
  c.total_dias_programa,
  c.fecha_onboarding + c.total_dias_programa AS fecha_vencimiento,
  (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE AS dias_restantes,
  c.estado_contacto,
  c.health_score,
  CASE
    WHEN (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE < 0 THEN 'vencido'
    WHEN (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE <= 7 THEN 'urgente'
    WHEN (c.fecha_onboarding + c.total_dias_programa) - CURRENT_DATE <= 15 THEN 'proximo'
    ELSE 'ok'
  END AS semaforo
FROM clients c
WHERE c.estado = 'activo' AND c.fecha_onboarding IS NOT NULL
ORDER BY dias_restantes ASC;

-- ========================================
-- V_SESSION_AVAILABILITY: Sesiones 1a1
-- ========================================
CREATE OR REPLACE VIEW v_session_availability AS
SELECT
  c.id AS client_id,
  c.nombre,
  c.programa,
  c.llamadas_base,
  count(ts.id) FILTER (WHERE ts.estado = 'done') AS sesiones_consumidas,
  c.llamadas_base - count(ts.id) FILTER (WHERE ts.estado = 'done') AS sesiones_disponibles,
  CASE
    WHEN c.llamadas_base - count(ts.id) FILTER (WHERE ts.estado = 'done') <= 0 THEN 'agotadas'
    WHEN c.llamadas_base - count(ts.id) FILTER (WHERE ts.estado = 'done') = 1 THEN 'ultima'
    ELSE 'disponible'
  END AS semaforo,
  round(avg(ts.rating) FILTER (WHERE ts.rating IS NOT NULL), 1) AS rating_promedio
FROM clients c
LEFT JOIN tracker_sessions ts ON ts.client_id = c.id
WHERE c.estado = 'activo'
GROUP BY c.id, c.nombre, c.programa, c.llamadas_base;

-- ========================================
-- V_CLOSER_KPIS
-- ========================================
CREATE OR REPLACE VIEW v_closer_kpis AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(l.fecha_llamada::date) AS mes_fiscal,
  count(*) AS total_agendas,
  count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) AS presentadas,
  count(*) FILTER (WHERE l.lead_calificado = 'calificado') AS calificadas,
  count(*) FILTER (WHERE l.estado = 'cerrado') AS cerradas,
  CASE WHEN count(*) > 0 THEN
    round(count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show'))::decimal / count(*) * 100, 1)
  ELSE 0 END AS show_up_pct,
  CASE WHEN count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) > 0 THEN
    round(count(*) FILTER (WHERE l.estado = 'cerrado')::decimal / count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show')) * 100, 1)
  ELSE 0 END AS cierre_pct,
  coalesce(round(avg(l.ticket_total) FILTER (WHERE l.estado = 'cerrado'), 0), 0) AS aov
FROM team_members tm
JOIN leads l ON l.closer_id = tm.id
WHERE tm.is_closer = true AND l.fecha_llamada IS NOT NULL
GROUP BY tm.id, tm.nombre, get_fiscal_month(l.fecha_llamada::date);

-- ========================================
-- V_SETTER_KPIS
-- ========================================
CREATE OR REPLACE VIEW v_setter_kpis AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(l.fecha_agendado::date) AS mes_fiscal,
  count(*) AS total_agendas,
  count(*) FILTER (WHERE l.estado = 'cerrado') AS cerradas
FROM team_members tm
JOIN leads l ON l.setter_id = tm.id
WHERE tm.is_setter = true AND l.fecha_agendado IS NOT NULL
GROUP BY tm.id, tm.nombre, get_fiscal_month(l.fecha_agendado::date);
