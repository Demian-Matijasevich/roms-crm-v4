-- ========================================
-- FISCAL MONTH HELPER (standard calendar months: 1st to last day)
-- ========================================
-- Returns the fiscal month label for a given date.
-- ROMS uses standard calendar months.
CREATE OR REPLACE FUNCTION get_fiscal_month(d date)
RETURNS text AS $$
DECLARE
  month_names text[] := ARRAY[
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
BEGIN
  RETURN month_names[EXTRACT(MONTH FROM d)::int] || ' ' || EXTRACT(YEAR FROM d)::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Keep backward-compatible alias
CREATE OR REPLACE FUNCTION get_month_7_7(d date)
RETURNS text AS $$
BEGIN
  RETURN get_fiscal_month(d);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Returns start date of the current fiscal month (1st of month)
CREATE OR REPLACE FUNCTION current_fiscal_start()
RETURNS date AS $$
BEGIN
  RETURN date_trunc('month', CURRENT_DATE)::date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Returns end date of the current fiscal month (last day of month)
CREATE OR REPLACE FUNCTION current_fiscal_end()
RETURNS date AS $$
BEGIN
  RETURN (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Returns start of PREVIOUS fiscal month
CREATE OR REPLACE FUNCTION prev_fiscal_start()
RETURNS date AS $$
BEGIN
  RETURN (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if a date falls in the current fiscal month
CREATE OR REPLACE FUNCTION is_current_fiscal(d date)
RETURNS boolean AS $$
BEGIN
  RETURN d >= current_fiscal_start() AND d <= current_fiscal_end();
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================================
-- HEALTH SCORE CALCULATION
-- ========================================
CREATE OR REPLACE FUNCTION calculate_health_score(client_uuid uuid)
RETURNS int AS $$
DECLARE
  score decimal := 0;
  payment_score decimal := 0;
  session_score decimal := 0;
  progress_score decimal := 0;
  activity_score decimal := 0;
  billing_score decimal := 0;
  c clients%ROWTYPE;
  total_payments int;
  paid_on_time int;
  total_sessions int;
  done_sessions int;
  avg_rating decimal;
  weeks_filled int;
  days_since_followup int;
BEGIN
  SELECT * INTO c FROM clients WHERE id = client_uuid;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- PAYMENT SCORE (30%) — ratio of on-time payments
  SELECT
    count(*),
    count(*) FILTER (WHERE estado = 'pagado')
  INTO total_payments, paid_on_time
  FROM payments WHERE client_id = client_uuid OR lead_id = c.lead_id;

  IF total_payments > 0 THEN
    payment_score := (paid_on_time::decimal / total_payments) * 30;
  ELSE
    payment_score := 15; -- No payments yet, neutral
  END IF;

  -- SESSION SCORE (20%) — avg rating + completion ratio
  SELECT
    count(*),
    count(*) FILTER (WHERE estado = 'done'),
    coalesce(avg(rating) FILTER (WHERE rating IS NOT NULL), 0)
  INTO total_sessions, done_sessions, avg_rating
  FROM tracker_sessions WHERE client_id = client_uuid;

  IF c.llamadas_base > 0 THEN
    session_score := (least(done_sessions::decimal / c.llamadas_base, 1.0) * 10)
                   + (least(avg_rating / 10.0, 1.0) * 10);
  ELSE
    session_score := 10;
  END IF;

  -- PROGRESS SCORE (20%) — weeks with status filled
  weeks_filled := 0;
  IF c.semana_1_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  IF c.semana_2_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  IF c.semana_3_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  IF c.semana_4_estado IS NOT NULL THEN weeks_filled := weeks_filled + 1; END IF;
  progress_score := (weeks_filled::decimal / 4) * 20;

  -- ACTIVITY SCORE (15%) — days since last follow-up
  IF c.fecha_ultimo_seguimiento IS NOT NULL THEN
    days_since_followup := CURRENT_DATE - c.fecha_ultimo_seguimiento;
    IF days_since_followup <= 7 THEN activity_score := 15;
    ELSIF days_since_followup <= 14 THEN activity_score := 10;
    ELSIF days_since_followup <= 30 THEN activity_score := 5;
    ELSE activity_score := 0;
    END IF;
  ELSE
    activity_score := 5;
  END IF;

  -- BILLING SCORE (15%) — has reported billing
  billing_score := 0;
  IF c.facturacion_mes_1 IS NOT NULL AND c.facturacion_mes_1 != '' THEN billing_score := billing_score + 3.75; END IF;
  IF c.facturacion_mes_2 IS NOT NULL AND c.facturacion_mes_2 != '' THEN billing_score := billing_score + 3.75; END IF;
  IF c.facturacion_mes_3 IS NOT NULL AND c.facturacion_mes_3 != '' THEN billing_score := billing_score + 3.75; END IF;
  IF c.facturacion_mes_4 IS NOT NULL AND c.facturacion_mes_4 != '' THEN billing_score := billing_score + 3.75; END IF;

  score := payment_score + session_score + progress_score + activity_score + billing_score;
  RETURN least(greatest(round(score)::int, 0), 100);
END;
$$ LANGUAGE plpgsql STABLE;
