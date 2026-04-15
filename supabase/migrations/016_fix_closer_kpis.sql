-- Fix v_closer_kpis: calificadas should be a subset of presentadas (only count leads that showed up)
-- Also exclude reprogramada/no_show/cancelada from total_agendas denominator for better show_up_pct
CREATE OR REPLACE VIEW v_closer_kpis AS
SELECT
  tm.id AS team_member_id,
  tm.nombre,
  get_fiscal_month(l.fecha_llamada::date) AS mes_fiscal,
  count(*) AS total_agendas,
  count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show', 'reprogramada')) AS presentadas,
  count(*) FILTER (WHERE l.lead_calificado = 'calificado' AND l.estado NOT IN ('pendiente', 'cancelada', 'no_show', 'reprogramada')) AS calificadas,
  count(*) FILTER (WHERE l.estado IN ('cerrado', 'adentro_seguimiento')) AS cerradas,
  CASE WHEN count(*) > 0 THEN
    round(count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show', 'reprogramada'))::decimal / count(*) * 100, 1)
  ELSE 0 END AS show_up_pct,
  CASE WHEN count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show', 'reprogramada')) > 0 THEN
    round(count(*) FILTER (WHERE l.estado IN ('cerrado', 'adentro_seguimiento'))::decimal / count(*) FILTER (WHERE l.estado NOT IN ('pendiente', 'cancelada', 'no_show', 'reprogramada')) * 100, 1)
  ELSE 0 END AS cierre_pct,
  coalesce(round(avg(l.ticket_total) FILTER (WHERE l.estado IN ('cerrado', 'adentro_seguimiento')), 0), 0) AS aov
FROM team_members tm
JOIN leads l ON l.closer_id = tm.id
WHERE tm.is_closer = true AND l.fecha_llamada IS NOT NULL
GROUP BY tm.id, tm.nombre, get_fiscal_month(l.fecha_llamada::date);
