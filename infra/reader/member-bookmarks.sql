-- Reader bookmarks are separate from the editorial and public-read roles.
-- Apply only with a separately provisioned member service role and backups.
BEGIN;
CREATE SCHEMA IF NOT EXISTS reader_member;
REVOKE ALL ON SCHEMA reader_member FROM PUBLIC;

CREATE TABLE reader_member.bookmarks (
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 255),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_id)
);
REVOKE ALL ON reader_member.bookmarks FROM PUBLIC;
ALTER TABLE reader_member.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reader_member.bookmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY own_bookmarks ON reader_member.bookmarks
  USING (user_id = current_setting('reader_member.user_id', true))
  WITH CHECK (user_id = current_setting('reader_member.user_id', true));
COMMIT;
