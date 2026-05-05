-- Bloque 2 + 3: Gastos pro + USD rate snapshot por mes

-- ── 1) Gastos: agregar monto_ars + usd_rate_aplicado, hacer billetera/categoria obligatorios ──
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS monto_ars numeric(14,2) DEFAULT 0;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS usd_rate_aplicado numeric(10,2);

UPDATE gastos SET billetera = 'sin_caja' WHERE billetera IS NULL OR billetera = '';
UPDATE gastos SET categoria = 'otros' WHERE categoria IS NULL OR categoria = '';

ALTER TABLE gastos ALTER COLUMN billetera SET NOT NULL;
ALTER TABLE gastos ALTER COLUMN categoria SET NOT NULL;

-- ── 2) Tabla gastos_categorias: lista fija que admin maneja ──
CREATE TABLE IF NOT EXISTS gastos_categorias (
  nombre text PRIMARY KEY,
  orden int DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
INSERT INTO gastos_categorias (nombre, orden) VALUES
  ('software', 1),
  ('contractors', 2),
  ('marketing', 3),
  ('viajes', 4),
  ('honorarios', 5),
  ('comisiones', 6),
  ('impuestos', 7),
  ('infra', 8),
  ('eventos', 9),
  ('otros', 99)
ON CONFLICT (nombre) DO NOTHING;

-- ── 3) Tabla gastos_cajas: cajas/billeteras fijas con su moneda ──
CREATE TABLE IF NOT EXISTS gastos_cajas (
  nombre text PRIMARY KEY,
  moneda text NOT NULL DEFAULT 'usd',
  orden int DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
INSERT INTO gastos_cajas (nombre, moneda, orden) VALUES
  ('mercado_pago', 'ars', 1),
  ('binance', 'usd', 2),
  ('wise', 'usd', 3),
  ('cash_ars', 'ars', 4),
  ('cash_usd', 'usd', 5),
  ('stripe', 'usd', 6),
  ('transferencia_ars', 'ars', 7),
  ('transferencia_usd', 'usd', 8),
  ('sin_caja', 'usd', 99)
ON CONFLICT (nombre) DO NOTHING;

-- ── 4) USD rate history por mes (YYYY-MM) ──
CREATE TABLE IF NOT EXISTS usd_rate_history (
  mes text PRIMARY KEY,
  rate numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
