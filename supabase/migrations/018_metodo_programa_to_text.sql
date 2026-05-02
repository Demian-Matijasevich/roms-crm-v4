-- Convierte enums metodo_pago y programa a TEXT para permitir agregar valores nuevos sin migrations.
-- Hay que dropear las vistas que dependen de esas columnas, alterar, y recrearlas.

-- 1) Dropear vistas dependientes
DROP VIEW IF EXISTS v_treasury;
DROP VIEW IF EXISTS v_renewal_queue;
DROP VIEW IF EXISTS v_session_availability;

-- 2) Alterar columnas (enum → text)
ALTER TABLE payments ALTER COLUMN metodo_pago TYPE text USING metodo_pago::text;
ALTER TABLE leads ALTER COLUMN programa_pitcheado TYPE text USING programa_pitcheado::text;
ALTER TABLE clients ALTER COLUMN programa TYPE text USING programa::text;
ALTER TABLE renewal_history ALTER COLUMN programa_anterior TYPE text USING programa_anterior::text;
ALTER TABLE renewal_history ALTER COLUMN programa_nuevo TYPE text USING programa_nuevo::text;

-- 3) Recrear vistas (definición original de migrations/004_views.sql)
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
