-- ============================================================================
-- 033 — Features estilo Trello para el kanban (política y general)
--
-- Tablas nuevas:
--   lead_comments      — wall de comentarios threaded por lead
--   lead_checklist     — sub-tareas/items por lead con done + posición
--   lead_labels        — labels (etiquetas) globales con color
--   lead_label_links   — N:N entre leads y labels
--   lead_attachments   — archivos adjuntos por lead (URL externa o storage)
--   lead_activity      — log de eventos (movió etapa, comentó, agregó label, etc.)
--
-- Columnas nuevas:
--   leads.kanban_order — para ordenar manualmente dentro de columna
-- ============================================================================

-- COMENTARIOS (wall de conversación por card)
CREATE TABLE IF NOT EXISTS lead_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES team_members(id),
  author_nombre text,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_comments_lead ON lead_comments(lead_id, created_at DESC);

-- CHECKLIST (sub-tareas por card)
CREATE TABLE IF NOT EXISTS lead_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  label text NOT NULL,
  done boolean DEFAULT false,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lead_checklist_lead ON lead_checklist(lead_id, position);

-- LABELS GLOBALES (colored tags compartidos)
CREATE TABLE IF NOT EXISTS lead_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#3b82f6',
  scope text DEFAULT 'all',  -- 'all' | 'politica' | 'general' (para filtrar visualmente)
  created_at timestamptz DEFAULT now()
);

-- N:N entre leads y labels
CREATE TABLE IF NOT EXISTS lead_label_links (
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES lead_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, label_id)
);

-- ATTACHMENTS (archivos / links externos)
CREATE TABLE IF NOT EXISTS lead_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  url text NOT NULL,
  tipo text,        -- 'pdf' | 'image' | 'doc' | 'link' | 'other'
  size_bytes bigint,
  uploaded_by uuid REFERENCES team_members(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_attachments_lead ON lead_attachments(lead_id, created_at DESC);

-- ACTIVITY LOG (quién hizo qué dentro del card)
-- Tipos: comment | etapa_change | label_add | label_remove | checklist_item_add |
--        checklist_item_done | attachment_add | assignment | other
CREATE TABLE IF NOT EXISTS lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES team_members(id),
  actor_nombre text,
  tipo text NOT NULL,
  mensaje text,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON lead_activity(lead_id, created_at DESC);

-- KANBAN ORDER en leads (drag&drop dentro de columna)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kanban_order numeric DEFAULT 1000;
CREATE INDEX IF NOT EXISTS idx_leads_kanban_order ON leads(etapa_politica, kanban_order) WHERE etapa_politica IS NOT NULL;

-- Seed: labels iniciales útiles para política
INSERT INTO lead_labels (nombre, color, scope) VALUES
  ('🔥 Urgente', '#ef4444', 'all'),
  ('⭐ VIP', '#a855f7', 'all'),
  ('⏳ Esperando docs', '#eab308', 'all'),
  ('📅 Reagendado', '#3b82f6', 'all'),
  ('🚫 No responde', '#6b7280', 'all'),
  ('🏛 Intendente', '#10b981', 'politica'),
  ('🏛 Concejal', '#06b6d4', 'politica'),
  ('🏛 Diputado/Senador', '#8b5cf6', 'politica'),
  ('💰 Alto budget', '#f59e0b', 'all')
ON CONFLICT (nombre) DO NOTHING;
