-- Bridge only existing, independently approved core evidence to an identical
-- studio revision. This migration never creates an approval or changes a head.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE kg.studio_approved_evidence_links (
 studio_revision_id uuid PRIMARY KEY REFERENCES kg.studio_public_revisions(revision_id),
 approved_revision_id uuid NOT NULL REFERENCES kg.approvals(revision_id),
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER studio_evidence_links_immutable BEFORE UPDATE OR DELETE ON kg.studio_approved_evidence_links FOR EACH ROW EXECUTE FUNCTION kg.no_change();
REVOKE ALL ON kg.studio_approved_evidence_links FROM PUBLIC, kg_studio_publish, kg_public_http;

CREATE FUNCTION kg.link_studio_approved_evidence(p_studio_revision uuid,p_approved_revision uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,kg,pg_temp AS $$
BEGIN
 IF p_studio_revision IS NULL OR p_approved_revision IS NULL OR NOT EXISTS (
  SELECT 1 FROM kg.studio_public_revisions s
  JOIN kg.revisions r ON r.id=p_approved_revision AND r.entity_id=s.entity_id AND r.locale='en' AND r.body=s.body
  JOIN kg.approvals a ON a.revision_id=r.id
  JOIN kg.revision_reader_metadata m ON m.revision_id=r.id AND m.title=s.title
  WHERE s.revision_id=p_studio_revision
 ) THEN RAISE EXCEPTION 'APPROVED_REVISION_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM kg.claims c JOIN kg.claim_evidence e
  ON e.revision_id=c.revision_id AND e.claim_key=c.claim_key
  WHERE c.revision_id=p_approved_revision) THEN
  RAISE EXCEPTION 'APPROVED_EVIDENCE_REQUIRED' USING ERRCODE='23514';
 END IF;
 INSERT INTO kg.studio_approved_evidence_links(studio_revision_id,approved_revision_id)
 VALUES(p_studio_revision,p_approved_revision);
END $$;
REVOKE ALL ON FUNCTION kg.link_studio_approved_evidence(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kg.link_studio_approved_evidence(uuid,uuid) TO kg_studio_publish;

-- Associate only when the exact entity and body have exactly one approved
-- source revision. Ambiguous matches remain unattached for editorial review.
CREATE FUNCTION kg.auto_link_studio_approved_evidence() RETURNS trigger
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
 WHERE s.entity_id=target_entity AND EXISTS (
  SELECT 1 FROM kg.claims c JOIN kg.claim_evidence e
  ON e.revision_id=c.revision_id AND e.claim_key=c.claim_key
  WHERE c.revision_id=r.id)
 GROUP BY s.revision_id HAVING count(*)=1
 ON CONFLICT(studio_revision_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER studio_revision_auto_evidence AFTER INSERT ON kg.studio_public_revisions
 FOR EACH ROW EXECUTE FUNCTION kg.auto_link_studio_approved_evidence();
CREATE TRIGGER studio_approval_auto_evidence AFTER INSERT ON kg.approvals
 FOR EACH ROW EXECUTE FUNCTION kg.auto_link_studio_approved_evidence();
REVOKE ALL ON FUNCTION kg.auto_link_studio_approved_evidence() FROM PUBLIC;

CREATE OR REPLACE VIEW kg.public_claim_sources WITH (security_barrier=true) AS
 SELECT p.entity_id,p.locale,p.version,p.revision_id,
  c.claim_key,c.anchor,c.statement,s.id AS source_id,
  s.locator,s.description,s.accessed_at,ev.stance,ev.pinpoint,ev.checked_at
 FROM kg.public_entries p JOIN kg.claims c ON c.revision_id=p.revision_id
 JOIN kg.claim_evidence ev ON ev.revision_id=c.revision_id AND ev.claim_key=c.claim_key
 JOIN kg.sources s ON s.id=ev.source_id WHERE p.locale='en'
 UNION ALL
 SELECT p.entity_id,p.locale,p.version,p.revision_id,
  c.claim_key,c.anchor,c.statement,s.id AS source_id,
  s.locator,s.description,s.accessed_at,ev.stance,ev.pinpoint,ev.checked_at
 FROM kg.public_entries p JOIN kg.studio_approved_evidence_links l ON l.studio_revision_id=p.revision_id
 JOIN kg.claims c ON c.revision_id=l.approved_revision_id
 JOIN kg.claim_evidence ev ON ev.revision_id=c.revision_id AND ev.claim_key=c.claim_key
 JOIN kg.sources s ON s.id=ev.source_id WHERE p.locale='en';
COMMIT;
