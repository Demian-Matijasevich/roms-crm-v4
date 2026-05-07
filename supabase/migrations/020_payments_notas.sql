-- Agregar campo notas a payments para guardar metadata (ej. duplicados marcados)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notas text;
