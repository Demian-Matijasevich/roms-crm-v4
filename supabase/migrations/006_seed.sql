-- Seed team members for ROMS
INSERT INTO team_members (nombre, etiqueta, rol, is_admin, is_closer, is_setter, is_cobranzas, is_seguimiento, comision_pct, pin) VALUES
  ('Fran', 'fran', 'admin', true, false, false, false, false, 0, '1001'),
  ('Juanma', 'juanma', 'admin', true, false, false, false, false, 0, '1002'),
  ('Valentino', 'valentino', 'closer_setter', false, true, true, false, false, 0.10, '2001'),
  ('Agust\u00edn', 'agustin', 'closer', false, true, false, false, false, 0.10, '2002'),
  ('Juan Mart\u00edn', 'juanmartin', 'closer', false, true, false, false, false, 0.10, '2003'),
  ('Fede', 'fede', 'closer', false, true, false, false, false, 0.10, '2004'),
  ('Guille', 'guille', 'setter', false, false, true, false, false, 0.05, '3001');

-- Seed payment methods for ROMS
INSERT INTO payment_methods (nombre, titular, tipo_moneda) VALUES
  ('Mercado Pago', 'ROMS', 'ars'),
  ('Transferencia', 'ROMS', 'usd'),
  ('Cash', NULL, 'usd'),
  ('Binance', 'ROMS', 'usd'),
  ('Stripe', 'ROMS', 'usd'),
  ('Wise', 'ROMS', 'usd');
