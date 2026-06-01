-- ============================================================
-- 028 — Nicho/Vertical del cliente (ROMS Normal vs ROMS Política)
-- ============================================================
-- Permite categorizar leads por VERTICAL (no por producto).
-- Un cliente puede comprar Omnipresencia y ser de cualquier vertical.
-- "general" = e-commerce y negocios típicos (default, lo que ya existe).
-- "politica" = clientes políticos (campaña, asesoramiento, etc).
-- Se pueden sumar verticales nuevos sin tocar el código (real_estate, health, etc).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS nicho text DEFAULT 'general';

COMMENT ON COLUMN leads.nicho IS
  'Vertical del cliente. general / politica / real_estate / health / otro. Default general.';

CREATE INDEX IF NOT EXISTS idx_leads_nicho ON leads(nicho);

-- Asegurar que todos los leads existentes tengan nicho="general"
UPDATE leads SET nicho = 'general' WHERE nicho IS NULL;
