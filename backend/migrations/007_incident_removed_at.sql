-- Set when the reporter deletes their incident from the Profile tab. The row is kept
-- (status is also set to 'inactive'); list endpoints skip rows where this is set.
ALTER TABLE incidents ADD COLUMN removed_at timestamptz;
