-- Read-only login for a collaborator. IAM-token auth only (see the insight-friend IAM user).
-- devices is intentionally excluded: it holds user push tokens and locations.
CREATE USER friend_readonly;
GRANT rds_iam TO friend_readonly;
GRANT CONNECT ON DATABASE postgres TO friend_readonly;
GRANT USAGE ON SCHEMA public TO friend_readonly;
GRANT SELECT ON incidents, votes TO friend_readonly;
