-- ============================================================
-- 024 — Rol jefe de ventas (Mati) + seed
-- ============================================================
-- Mati es el jefe de ventas. Necesita ver TODO el contexto de
-- ventas, performance de closers, llamadas estancadas, pipeline,
-- y poder accionar (apurar closers). Le damos acceso admin
-- + flag is_jefe_ventas para distinguir desde UI.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_jefe_ventas boolean DEFAULT false;

-- Seed Mati
INSERT INTO team_members (nombre, etiqueta, rol, is_admin, is_jefe_ventas, is_closer, is_setter, is_cobranzas, is_seguimiento, comision_pct, pin)
VALUES ('Mati', 'mati', 'jefe_ventas', true, true, false, false, false, false, 0, '1003')
ON CONFLICT DO NOTHING;
