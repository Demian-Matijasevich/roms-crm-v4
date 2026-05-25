-- ============================================================
-- 022 — Pipeline de prospectos (números de teléfono pre-lead)
-- ============================================================
-- Lo que pidió Juanma en la reu del 2026-05-25:
-- "Un CRM donde ellos puedan cargar el número de teléfono
--  y que después se haga una trazabilidad de qué pasa con ese
--  número. Tipo, contactado, no contactado, le hable, no le hable."
--
-- Entidad ligera (pre-lead). Cuando un prospecto agenda llamada
-- se convierte en lead (queda vinculado via convertido_lead_id).

CREATE TABLE IF NOT EXISTS prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text,
  telefono text NOT NULL,
  instagram text,
  email text,
  origen text,                                  -- IG / referido / cold / etc
  notas text,
  etiquetas text[] NOT NULL DEFAULT '{}',
  estado text NOT NULL DEFAULT 'nuevo'
    CHECK (estado IN ('nuevo','intentado','respondio','agendado','descartado')),
  asignado_a uuid REFERENCES team_members(id),  -- a quién pertenece la lista
  creado_por uuid REFERENCES team_members(id),  -- quién lo cargó (típicamente == asignado_a)
  convertido_lead_id uuid REFERENCES leads(id), -- si se convirtió en lead, queda linkeado
  fecha_ultimo_contacto timestamptz,
  fecha_proximo_seguimiento date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos(estado);
CREATE INDEX IF NOT EXISTS idx_prospectos_asignado ON prospectos(asignado_a);
CREATE INDEX IF NOT EXISTS idx_prospectos_telefono ON prospectos(telefono);
CREATE INDEX IF NOT EXISTS idx_prospectos_fecha_seguimiento ON prospectos(fecha_proximo_seguimiento) WHERE estado IN ('nuevo','intentado','respondio');

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION touch_prospectos_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prospectos_updated_at ON prospectos;
CREATE TRIGGER trg_prospectos_updated_at
  BEFORE UPDATE ON prospectos
  FOR EACH ROW EXECUTE FUNCTION touch_prospectos_updated_at();

COMMENT ON TABLE prospectos IS
  'Pre-leads: numeros de telefono cargados por setters/closers para hacer trazabilidad de contacto. Cuando agendan llamada se convierten en lead.';
