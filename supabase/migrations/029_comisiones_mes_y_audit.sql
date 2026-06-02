-- ============================================================
-- 029 — Aplicado_en_comisiones_mes + audit_log
-- ============================================================
-- Soluciona el bug "refund descontado dos veces": cuando se procesan
-- comisiones de un mes, los refunds incluidos quedan marcados con
-- el YYYY-MM para no descontarlos otra vez en futuros cierres.
--
-- También crea la tabla audit_log para trackear quién cambió qué.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS aplicado_en_comisiones_mes text;

COMMENT ON COLUMN payments.aplicado_en_comisiones_mes IS
  'YYYY-MM en que este refund/pago se aplicó a las comisiones del equipo. Si está NULL aún no se aplicó. Marca para no descontar doble.';

CREATE INDEX IF NOT EXISTS idx_payments_aplicado_mes ON payments(aplicado_en_comisiones_mes);

-- ── Audit log ──
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field text,
  old_value text,
  new_value text,
  changed_by_id uuid REFERENCES team_members(id),
  changed_by_nombre text,
  action text DEFAULT 'update',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS
  'Registro de cambios: quién cambió qué campo en qué entidad y cuándo.';

-- ── Health score y campos derivados para clientes ──
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS health_score_auto numeric,
  ADD COLUMN IF NOT EXISTS dias_sin_contacto int;

COMMENT ON COLUMN clients.health_score_auto IS
  'Score 0-100 calculado automáticamente desde días sin contacto, último pago, estado de cuotas. 0=riesgo alto, 100=ideal.';

-- ── Normalización de teléfonos: columna derivada ──
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS telefono_normalizado text;

COMMENT ON COLUMN leads.telefono_normalizado IS
  'Teléfono solo dígitos (sin +, espacios, guiones). Util para matchear duplicados.';

CREATE INDEX IF NOT EXISTS idx_leads_telefono_norm ON leads(telefono_normalizado);

-- Backfill inicial: extraer solo dígitos del teléfono existente
UPDATE leads
SET telefono_normalizado = regexp_replace(coalesce(telefono, ''), '\D', '', 'g')
WHERE telefono_normalizado IS NULL AND telefono IS NOT NULL;
