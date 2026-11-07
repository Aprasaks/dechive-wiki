-- Isolated test migration: metadata is tied to a specific revision, not to a
-- mutable entity. This file is not a production migration or publication step.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE kg.revision_reader_metadata (
 revision_id uuid PRIMARY KEY REFERENCES kg.revisions(id),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
 summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 1000),
 primary_domain text NOT NULL CHECK (primary_domain IN
  ('science','technology','humanities','philosophy','history','society',
   'economics','health','life','space','earth','arts-culture'))
);
-- A revision's metadata is write-once. A correction requires a new revision,
-- preventing a draft edit from changing a published version's title or domain.
CREATE TRIGGER revision_reader_metadata_immutable
 BEFORE UPDATE OR DELETE ON kg.revision_reader_metadata
 FOR EACH ROW EXECUTE FUNCTION kg.no_change();
CREATE FUNCTION kg.reject_metadata_after_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.revision_id::text, 7007));
 IF EXISTS (SELECT 1 FROM kg.approvals WHERE revision_id=NEW.revision_id) THEN
  RAISE EXCEPTION 'APPROVED_REVISION_METADATA_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION kg.lock_revision_metadata_before_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.revision_id::text, 7007));
 RETURN NEW;
END $$;
CREATE TRIGGER aaa_revision_metadata_approval_lock
 BEFORE INSERT ON kg.approvals FOR EACH ROW
 EXECUTE FUNCTION kg.lock_revision_metadata_before_approval();
CREATE TRIGGER revision_reader_metadata_before_approval
 BEFORE INSERT ON kg.revision_reader_metadata
 FOR EACH ROW EXECUTE FUNCTION kg.reject_metadata_after_approval();
-- Only the active public snapshot may expose its own metadata.
CREATE VIEW kg.public_revision_metadata WITH (security_barrier=true) AS
 SELECT p.entity_id,p.locale,p.version,p.revision_id,m.title,m.summary,m.primary_domain
 FROM kg.public_entries p JOIN kg.revision_reader_metadata m ON m.revision_id=p.revision_id
 WHERE p.locale='en';
REVOKE ALL ON kg.revision_reader_metadata, kg.public_revision_metadata FROM PUBLIC;
GRANT SELECT ON kg.public_revision_metadata TO kg_public_http;
COMMIT;
