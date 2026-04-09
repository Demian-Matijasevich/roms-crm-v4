-- Add push subscription storage to team_members
ALTER TABLE team_members
ADD COLUMN push_subscription jsonb DEFAULT NULL;

COMMENT ON COLUMN team_members.push_subscription IS 'Web Push API subscription object (endpoint, keys)';
