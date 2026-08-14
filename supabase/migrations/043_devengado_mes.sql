-- 043: columna devengado_mes en gastos
--
-- Antes: el mes al que se DEVENGA un gasto se parseaba del texto del concepto
-- (regex sobre "sueldo julio", "roms corp jun/jul", etc.). Esto es vulnerable
-- a que un admin escriba una palabra que dispare el matcher y termine moviendo
-- plata entre buckets sin querer (bug ALTO auditado).
--
-- Ahora: cada gasto guarda EXPLÍCITAMENTE su devengado_mes (formato YYYY-MM).
-- Los endpoints /api/caja/* aceptan el campo (validado); si no viene, se
-- deriva de la fecha. Nunca más del concepto.

ALTER TABLE gastos
  ADD COLUMN IF NOT EXISTS devengado_mes text
  CHECK (devengado_mes IS NULL OR devengado_mes ~ '^\d{4}-\d{2}$');

-- Backfill: copiar YYYY-MM de la fecha para todos los existentes.
-- Los que hoy están "movidos por concepto" quedarán devengados al mes de la
-- fecha real (comportamiento neutro y auditable). Si algún gasto histórico
-- necesita quedar devengado a otro mes, se actualiza manualmente.
UPDATE gastos
   SET devengado_mes = to_char(fecha, 'YYYY-MM')
 WHERE devengado_mes IS NULL
   AND fecha IS NOT NULL;

CREATE INDEX IF NOT EXISTS gastos_devengado_mes_idx
  ON gastos (devengado_mes);
