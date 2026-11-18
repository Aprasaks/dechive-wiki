-- Prevent a staged approval from transferring to any other studio revision.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION kg.link_studio_approved_evidence(p_studio_revision uuid,p_approved_revision uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
BEGIN
 IF p_studio_revision IS NULL OR p_approved_revision IS NULL OR NOT EXISTS (
  SELECT 1 FROM kg.studio_public_revisions s
  JOIN kg.revisions r ON r.id=p_approved_revision AND r.entity_id=s.entity_id AND r.locale='en' AND r.body=s.body
  JOIN kg.approvals a ON a.revision_id=r.id
  JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=s.title
  WHERE s.revision_id=p_studio_revision
  AND NOT EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged z WHERE z.revision_id=r.id AND z.studio_revision_id<>s.revision_id)
 ) THEN RAISE EXCEPTION 'APPROVED_REVISION_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM kg.claims c JOIN kg.claim_evidence e
  ON e.revision_id=c.revision_id AND e.claim_key=c.claim_key
  WHERE c.revision_id=p_approved_revision) THEN
  RAISE EXCEPTION 'APPROVED_EVIDENCE_REQUIRED' USING ERRCODE='23514';
 END IF;
 INSERT INTO kg.studio_approved_evidence_links(studio_revision_id,approved_revision_id)
 VALUES(p_studio_revision,p_approved_revision);
END $$;

CREATE OR REPLACE FUNCTION kg.auto_link_studio_approved_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
DECLARE target_entity uuid;
BEGIN
 IF TG_TABLE_NAME='approvals' THEN
  SELECT entity_id INTO STRICT target_entity FROM kg.revisions WHERE id=NEW.revision_id;
 ELSE target_entity:=NEW.entity_id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_entity::text,5311));
 INSERT INTO kg.studio_approved_evidence_links(studio_revision_id,approved_revision_id)
 SELECT s.revision_id,(array_agg(r.id ORDER BY r.id))[1]
 FROM kg.studio_public_revisions s
 JOIN kg.revisions r ON r.entity_id=s.entity_id AND r.locale='en' AND r.body=s.body
 JOIN kg.approvals a ON a.revision_id=r.id
 JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=s.title
 WHERE s.entity_id=target_entity
 AND NOT EXISTS(SELECT 1 FROM kg.studio_reviewed_evidence_staged z WHERE z.revision_id=r.id AND z.studio_revision_id<>s.revision_id)
 AND EXISTS (
  SELECT 1 FROM kg.claims c JOIN kg.claim_evidence e
  ON e.revision_id=c.revision_id AND e.claim_key=c.claim_key
  WHERE c.revision_id=r.id)
 GROUP BY s.revision_id HAVING count(*)=1
 ON CONFLICT(studio_revision_id) DO NOTHING;
 RETURN NEW;
END $$;

COMMIT;
