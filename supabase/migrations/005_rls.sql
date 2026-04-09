-- Enable RLS on all tables
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ig_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's team_member row
CREATE OR REPLACE FUNCTION get_my_team_member()
RETURNS team_members AS $$
  SELECT * FROM team_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ADMIN: full access to everything
CREATE POLICY admin_all_leads ON leads FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_clients ON clients FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_payments ON payments FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_sessions ON tracker_sessions FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_reports ON daily_reports FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_ig ON ig_metrics FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_onboarding ON onboarding FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_followups ON client_follow_ups FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_renewals ON renewal_history FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_utm ON utm_campaigns FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_payment_methods ON payment_methods FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY admin_all_tasks ON agent_tasks FOR ALL
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY agent_log_visible ON agent_log FOR SELECT
  USING ((get_my_team_member()).is_admin = true);

CREATE POLICY agent_log_insert ON agent_log FOR INSERT
  WITH CHECK (true); -- Service role inserts

-- CLOSER: see own leads
CREATE POLICY closer_own_leads ON leads FOR SELECT
  USING (closer_id = (get_my_team_member()).id);

CREATE POLICY closer_own_payments ON payments FOR SELECT
  USING (lead_id IN (SELECT id FROM leads WHERE closer_id = (get_my_team_member()).id));

-- SETTER: see own leads + insert
CREATE POLICY setter_own_leads ON leads FOR SELECT
  USING (setter_id = (get_my_team_member()).id);

CREATE POLICY setter_insert_reports ON daily_reports FOR INSERT
  WITH CHECK (setter_id = (get_my_team_member()).id);

CREATE POLICY setter_own_reports ON daily_reports FOR SELECT
  USING (setter_id = (get_my_team_member()).id);

-- SEGUIMIENTO: see clients and follow-ups
CREATE POLICY seguimiento_clients ON clients FOR SELECT
  USING ((get_my_team_member()).is_seguimiento = true);

CREATE POLICY seguimiento_followups ON client_follow_ups FOR ALL
  USING ((get_my_team_member()).is_seguimiento = true);

CREATE POLICY seguimiento_sessions ON tracker_sessions FOR SELECT
  USING ((get_my_team_member()).is_seguimiento = true);

-- TEAM MEMBERS: everyone can read
CREATE POLICY team_read ON team_members FOR SELECT
  USING (true);

-- Leaderboard: all closers/setters can read all leads for ranking
CREATE POLICY leaderboard_leads ON leads FOR SELECT
  USING ((get_my_team_member()).is_closer = true OR (get_my_team_member()).is_setter = true);

-- Service role bypass (for n8n and migrations)
-- Note: service_role key bypasses RLS automatically in Supabase
