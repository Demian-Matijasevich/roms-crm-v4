-- Gastos table for expense tracking synced from Google Sheets
CREATE TABLE IF NOT EXISTS gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheets_row_index int UNIQUE,
  fecha date,
  concepto text,
  monto_usd numeric(12,2) DEFAULT 0,
  categoria text,
  billetera text,
  pagado_a text,
  estado text DEFAULT 'pendiente',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_gastos_fecha ON gastos(fecha);
CREATE INDEX idx_gastos_categoria ON gastos(categoria);
