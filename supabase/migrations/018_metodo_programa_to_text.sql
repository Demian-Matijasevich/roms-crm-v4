-- Convierte enums metodo_pago y programa a TEXT para permitir agregar valores nuevos sin migrations
-- Aplicar en Supabase dashboard SQL editor (Auth → SQL Editor → New Query)

ALTER TABLE payments ALTER COLUMN metodo_pago TYPE text USING metodo_pago::text;

ALTER TABLE leads ALTER COLUMN programa_pitcheado TYPE text USING programa_pitcheado::text;
ALTER TABLE clients ALTER COLUMN programa TYPE text USING programa::text;
ALTER TABLE renewal_history ALTER COLUMN programa_anterior TYPE text USING programa_anterior::text;
ALTER TABLE renewal_history ALTER COLUMN programa_nuevo TYPE text USING programa_nuevo::text;

-- Los enums quedan en la DB pero ya no son obligatorios; los valores existentes se preservan como text.
-- Si querés también podés eliminar los TYPE viejos (opcional, no rompe nada):
-- DROP TYPE IF EXISTS metodo_pago;
-- DROP TYPE IF EXISTS programa;
